// backend/src/services/rpc-market-scanner.ts
//
// Direct RPC-based market scanner that bypasses the dead GraphQL indexer.
// Reads BinaryMarketsModule contract directly via viem publicClient.
//
// Flow:
//   1. Binary search for highest non-empty market ID
//   2. Scan backwards for live (Trading) markets
//   3. Filter by asset + cadence
//   4. Return LiveMarket[] compatible with existing agents

import { createPublicClient, http, type PublicClient } from 'viem';
import { somnia } from 'viem/chains';
import { binaryModuleReadAbi } from '@somnia-chain/markets-sdk';
import { config } from '../config/env.config';
import { EC_ASSETS, EC_CADENCES, marketKey } from '../config/somnia.config';
import { logger } from '../utils/logger.util';

const MODULE_ADDRESS = '0x3ecC694Cef705358864a646142ac17A90E29e388' as const;

interface RawMarket {
  id: number;
  hexId: string;
  oracleQuestionId: bigint;
  outcomeSlotCount: number;
  voidPolicy: number;
  collateral: string;
  originOperatorId: number;
  originVenueId: string;
  oracleAdapter: string;
  creator: string;
  market: string;
  pool: string;
  yesId: bigint;
  noId: bigint;
  tradingStart: number;
  expiry: number;
}

class RpcMarketScanner {
  private client: PublicClient;
  private maxId: number | null = null;
  private lastScan = 0;

  constructor() {
    this.client = createPublicClient({
      chain: somnia,
      transport: http(config.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network'),
    });
  }

  async exists(id: number): Promise<boolean> {
    const hex = ('0x' + id.toString(16).padStart(64, '0')) as `0x${string}`;
    try {
      const r = await this.client.readContract({
        address: MODULE_ADDRESS,
        abi: binaryModuleReadAbi,
        functionName: 'markets',
        args: [hex],
      });
      return r[9] !== '0x0000000000000000000000000000000000000000';
    } catch {
      return false;
    }
  }

  async readMarket(id: number): Promise<RawMarket | null> {
    const hex = ('0x' + id.toString(16).padStart(64, '0')) as `0x${string}`;
    try {
      const r = await this.client.readContract({
        address: MODULE_ADDRESS,
        abi: binaryModuleReadAbi,
        functionName: 'markets',
        args: [hex],
      });
      const pool = r[9] as string;
      if (pool === '0x0000000000000000000000000000000000000000') return null;

      return {
        id,
        hexId: hex,
        oracleQuestionId: r[0] as bigint,
        outcomeSlotCount: r[1] as number,
        voidPolicy: r[2] as number,
        collateral: r[3] as string,
        originOperatorId: r[4] as number,
        originVenueId: r[5] as string,
        oracleAdapter: r[6] as string,
        creator: r[7] as string,
        market: r[8] as string,
        pool,
        yesId: r[10] as bigint,
        noId: r[11] as bigint,
        tradingStart: Number(r[12]),
        expiry: Number(r[13]),
      };
    } catch {
      return null;
    }
  }

  async findMaxId(): Promise<number> {
    if (this.maxId !== null) return this.maxId;

    // Start from 1000, binary search up to 100k
    let lo = 1000;
    let hi = 100000;

    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (await this.exists(mid)) lo = mid;
      else hi = mid - 1;
    }

    this.maxId = lo;
    logger.info(`[RpcScanner] Max market ID: ${lo}`);
    return lo;
  }

  /**
   * Scan for live trading markets.
   * Works backwards from maxId, stops after CONSECUTIVE_EXPIRED gaps.
   */
  async scanLiveMarkets(opts?: {
    assets?: string[];
    cadences?: number[];
    limit?: number;
    minHeadroomSec?: number;
  }): Promise<RawMarket[]> {
    const assets = opts?.assets ?? EC_ASSETS;
    const cadences = opts?.cadences ?? EC_CADENCES;
    const limit = opts?.limit ?? 50;
    const minHeadroomSec = opts?.minHeadroomSec ?? 300;

    const maxId = await this.findMaxId();
    const now = Math.floor(Date.now() / 1000);
    const results: RawMarket[] = [];
    let consecutiveExpired = 0;
    const MAX_EXPIRED_GAP = 200; // stop after this many consecutive expired markets

    // Scan backwards from maxId
    for (let i = maxId; i >= 1 && consecutiveExpired < MAX_EXPIRED_GAP; i--) {
      const market = await this.readMarket(i);
      if (!market) {
        consecutiveExpired++;
        continue;
      }

      const isExpired = market.expiry < now;
      if (isExpired) {
        consecutiveExpired++;
        continue;
      }

      consecutiveExpired = 0; // reset on any live market

      const isTrading = market.tradingStart <= now;
      if (!isTrading) continue;

      // Filter by headroom
      const secondsLeft = market.expiry - now;
      if (secondsLeft < minHeadroomSec) continue;

      // Derive asset and interval from market data
      // The oracle question typically encodes asset + interval
      // For now, use the slot count to guess (2 = binary yes/no)
      // We need to map marketId patterns or on-chain data to assets
      const asset = await this.guessAsset(market);
      if (asset && !assets.includes(asset as any)) continue;

      const intervalSec = market.expiry - market.tradingStart;
      const cadence = this.roundToCadence(intervalSec);
      if (cadence && !cadences.includes(cadence as any)) continue;

      results.push(market);
      if (results.length >= limit) break;
    }

    logger.info(`[RpcScanner] Found ${results.length} live markets (scanned ${maxId} backwards)`);
    this.lastScan = now;
    return results;
  }

  private roundToCadence(intervalSec: number): number | null {
    for (const c of EC_CADENCES) {
      if (Math.abs(intervalSec - c) < 60) return c;
    }
    return null;
  }

  private async guessAsset(market: RawMarket): Promise<string | null> {
    // Strategy: check the collateral address
    // USDso on mainnet: 0x00000022dA000002656c64D9eA6011ea952D008A
    // We can't determine asset from contract data alone without the indexer
    // But we know the pattern: BTC and ETH markets exist
    // The oracle question ID or originVenueId might help
    // For now, return null to accept all (the agent layer handles asset filtering)
    return null;
  }
}

export const rpcMarketScanner = new RpcMarketScanner();
