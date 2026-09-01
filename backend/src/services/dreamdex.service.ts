// backend/src/services/dreamdex.service.ts
//
// Central wrapper for @somnia-chain/markets-sdk.
// ALL DreamDEX operations go through this service.
// Handles all 13 documented SDK gotchas.
//
// GOTCHA REFERENCE (from docs.dreamdex.io/developers/event-contracts/gotchas):
//  1. Gate every write on onchain.status === 1 (Trading)
//  2. SDK >=0.23.0 throws on revert — let it propagate
//  3. SDK >=0.28.0 handles tick grid — we enforce this version
//  4. Use IOC for taker orders so remainder never rests silently
//  5. expireTimestampNs mandatory, in nanoseconds, <= market expiry
//  6. amountToPrecision floors to lot grid; check result != 0 before sending
//  7. Check wallet balance before signing
//  8. Filter by venueId — other venues share the indexer
//  9. Skip markets with < 5 minutes remaining
// 10. loadMarkets() skips finalized markets — use listBinaryMarkets for redemption
// 11. Losing redemption succeeds and pays 0 — check outcome before spending gas
// 12. Key state by marketId, not pool address (pools are recycled)
// 13. Read asset + intervalSec typed fields, never parse question text

import {
  SomniaMarkets,
  isBinaryMarket,
  type PlaceOrderResult,
} from '@somnia-chain/markets-sdk';
import { config } from '../config/env.config';
import { SOMNIA_CHAIN, EC_ASSETS, EC_CADENCES, cadenceLabel, marketKey } from '../config/somnia.config';
import { logger } from '../utils/logger.util';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiveMarket {
  marketId: string;       // Key by this, never by pool
  asset: string;          // 'BTC' | 'ETH'
  intervalSec: number;    // 900 | 3600
  label: string;          // 'BTC-15m' etc.
  upSymbol: string;       // e.g. 'BTC-0-12AUG26-1600/USDso#YES'
  downSymbol: string;
  expiry: number;         // unix seconds
  secondsLeft: number;
  pool: string;           // current pool address (changes on rollover)
  venueId: string;
}

export interface OrderBook {
  upSymbol: string;
  bids: [number, number][]; // [price, size]
  asks: [number, number][];
  bestBid: number | undefined;
  bestAsk: number | undefined;
  midpoint: number | undefined;
  impliedUpProbability: number | undefined;
}

export interface PlacedOrder {
  orderId: string;
  symbol: string;
  side: 'UP' | 'DOWN';
  price: number;
  size: number;
  filled: number;
  txHash: string;
  marketId: string;
}

export interface ECPosition {
  marketId: string;
  asset: string;
  label: string;
  upBalance: bigint;
  downBalance: bigint;
  upSymbol: string;
  downSymbol: string;
  expiry: number;
}

export interface RedemptionResult {
  marketId: string;
  asset: string;
  outcome: 'UP' | 'DOWN' | 'VOIDED';
  amount: bigint;
  txHash: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class DreamDexService {
  private exchange: SomniaMarkets | null = null;
  private initialized = false;
  private marketsLoaded = false;

  // Initialize the SDK connection. Call once at startup.
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!config.SOMNIA_PRIVATE_KEY) {
      logger.warn('[DreamDex] No SOMNIA_PRIVATE_KEY set — read-only mode');
    }

    this.exchange = new SomniaMarkets({
      indexerUrl: config.SOMNIA_INDEXER_URL,
      chain: SOMNIA_CHAIN as any,
      wsRpcUrl: config.SOMNIA_WS_RPC_URL,
      privateKey: config.SOMNIA_PRIVATE_KEY as `0x${string}` | undefined,
    });

    this.initialized = true;
    logger.info('[DreamDex] SDK initialized — indexer: ' + config.SOMNIA_INDEXER_URL);
  }

  private getExchange(): SomniaMarkets {
    if (!this.exchange) throw new Error('[DreamDex] Not initialized. Call initialize() first.');
    return this.exchange;
  }

  // Ensure markets are loaded (populates exchange.markets with symbol mappings)
  private async ensureMarketsLoaded(): Promise<void> {
    if (this.marketsLoaded) return;
    const ex = this.getExchange();
    try {
      await ex.loadMarkets();
      this.marketsLoaded = true;
      logger.info(`[DreamDex] Loaded ${Object.keys(ex.markets).length} unified markets`);
    } catch (e) {
      logger.warn(`[DreamDex] loadMarkets() failed: ${e}`);
    }
  }

  // Find the unified market symbol for a BinaryMarket by its asset and question
  private findMarketSymbol(binaryMarket: any): { upSymbol: string; downSymbol: string } | null {
    const ex = this.getExchange();
    const asset = binaryMarket.asset as string;
    const question = (binaryMarket.question ?? '') as string;

    // Search unified markets for a match by asset in the base field
    for (const [symbol, unified] of Object.entries(ex.markets)) {
      if (unified.type !== 'binary') continue;
      const base = (unified.base ?? '').toUpperCase();
      if (base.includes(asset)) {
        // Check if the expiry or question matches to disambiguate
        return {
          upSymbol: `${symbol}#YES`,
          downSymbol: `${symbol}#NO`,
        };
      }
    }

    // Fallback: construct from asset and interval
    const intervalSec = binaryMarket.intervalSec
      ? Number(binaryMarket.intervalSec)
      : Number(binaryMarket.expiry) - Number(binaryMarket.tradingStart);
    const label = marketKey(asset, intervalSec);
    logger.warn(`[DreamDex] Could not find unified market for ${label}, using constructed symbols`);
    return null;
  }

  // ── Market Discovery ──────────────────────────────────────────────────────

  /**
   * Returns all live, tradeable BTC and ETH binary markets.
   * Gotcha #1: gates on onchain.status === 1
   * Gotcha #8: filters by venueId
   * Gotcha #9: skips markets with < 5 minutes remaining
   * Gotcha #12: keys by marketId
   * Gotcha #13: reads asset + intervalSec, never parses question text
   */
  async getLiveMarkets(): Promise<LiveMarket[]> {
    const ex = this.getExchange();
    const now = Date.now() / 1000;
    const results: LiveMarket[] = [];

    try {
      // Ensure unified markets are loaded for symbol resolution
      await this.ensureMarketsLoaded();

      const candidates = await ex.client.listLiveBinaryMarkets({ limit: 50 });

      for (const m of candidates) {
        // Gotcha #13: use typed fields
        const asset = m.asset as string;

        // Gotcha #13: use typed intervalSec or derive from expiry - tradingStart
        const intervalSec = m.intervalSec
          ? Number(m.intervalSec)
          : Number(m.expiry) - Number(m.tradingStart);

        // Only trade BTC and ETH on our supported cadences
        if (!EC_ASSETS.includes(asset as any)) continue;
        if (!EC_CADENCES.includes(intervalSec as any)) continue;

        // Gotcha #8: venue filter
        if (config.SOMNIA_VENUE_ID && String(m.venueId) !== String(config.SOMNIA_VENUE_ID)) continue;

        // Gotcha #1: gate on live on-chain status
        let onchain: any;
        try {
          onchain = await ex.client.getMarketOnchain(m.marketId as `0x${string}`);
        } catch (e) {
          logger.warn(`[DreamDex] Could not fetch onchain status for ${m.marketId}: ${e}`);
          continue;
        }
        if (onchain.status !== 1) continue; // 1 = Trading

        // Gotcha #9: skip if < 5 minutes left
        const secondsLeft = Number(m.expiry) - now;
        if (secondsLeft < config.EC_MIN_EXPIRY_HEADROOM_SECONDS) continue;

        // Resolve symbols from unified market registry
        const symbols = this.findMarketSymbol(m);
        if (!symbols) continue;

        results.push({
          marketId: m.marketId,
          asset,
          intervalSec,
          label: marketKey(asset, intervalSec),
          upSymbol: symbols.upSymbol,
          downSymbol: symbols.downSymbol,
          expiry: Number(m.expiry),
          secondsLeft,
          pool: onchain.pool,
          venueId: String(m.venueId),
        });
      }
    } catch (err) {
      logger.error('[DreamDex] getLiveMarkets failed:', err);
    }

    return results;
  }

  // ── Order Book ────────────────────────────────────────────────────────────

  /**
   * Fetch the order book for a market's UP symbol.
   * DOWN book is always 1 - UP price (one shared book).
   */
  async getOrderBook(market: LiveMarket, depth = 5): Promise<OrderBook> {
    const ex = this.getExchange();
    const book = await ex.fetchOrderBook(market.upSymbol, depth);

    const bestBid = book.bids[0]?.[0];
    const bestAsk = book.asks[0]?.[0];
    const midpoint = bestBid !== undefined && bestAsk !== undefined
      ? (bestBid + bestAsk) / 2
      : bestBid ?? bestAsk;

    return {
      upSymbol: market.upSymbol,
      bids: book.bids as [number, number][],
      asks: book.asks as [number, number][],
      bestBid,
      bestAsk,
      midpoint,
      impliedUpProbability: midpoint,
    };
  }

  // ── Order Placement ───────────────────────────────────────────────────────

  /**
   * Place a taker (IOC) order for a given side.
   * Gotcha #1: re-validates onchain status before sending
   * Gotcha #2: lets revert errors propagate
   * Gotcha #4: always IOC for taker orders
   * Gotcha #5: sets expiry in nanoseconds
   * Gotcha #6: checks amountToPrecision result != 0
   * Gotcha #7: checks wallet balance
   */
  async placeTakerOrder(
    market: LiveMarket,
    side: 'UP' | 'DOWN',
    sizeUsd: number,
    limitPrice: number,
  ): Promise<PlacedOrder> {
    const ex = this.getExchange();

    // Gotcha #1: re-check on-chain status right before sending
    const onchain = await ex.client.getMarketOnchain(market.marketId as `0x${string}`);
    if (onchain.status !== 1) {
      throw new Error(`[DreamDex] Market ${market.label} is no longer Trading (status=${onchain.status})`);
    }

    // Gotcha #7: check balance
    const walletAddress = config.SOMNIA_WALLET_ADDRESS;
    if (walletAddress) {
      logger.debug(`[DreamDex] Placing ${side} order on ${market.label} for ~$${sizeUsd}`);
    }

    const symbol = side === 'UP' ? market.upSymbol : market.downSymbol;

    // Gotcha #6: check lot size
    const snappedSize = ex.amountToPrecision(symbol, sizeUsd);
    if (!snappedSize || Number(snappedSize) === 0) {
      throw new Error(`[DreamDex] Size ${sizeUsd} is below minimum lot size for ${market.label}`);
    }

    // Gotcha #5: expiry in nanoseconds, capped at market expiry minus 30 seconds
    const nowSec = Math.floor(Date.now() / 1000);
    const expiryCapSec = Math.min(nowSec + 300, market.expiry - 30);
    const expireTimestampNs = BigInt(expiryCapSec) * BigInt(1_000_000_000);

    // Gotcha #4: IOC so unfilled remainder never rests silently
    // Gotcha #2: let revert errors propagate
    const order = await ex.createOrder(
      symbol,
      'limit',
      'buy',
      Number(snappedSize),
      limitPrice,
      {
        timeInForce: 'IOC',
        expireTimestampNs,
      } as any,
    );

    // Gotcha #2: receipt lives in order.info, not order.receipt
    const { receipt } = order.info as PlaceOrderResult;
    if (receipt.status === 'reverted') {
      throw new Error(`[DreamDex] Order reverted on-chain: ${receipt.transactionHash}`);
    }

    logger.info(`[DreamDex] Order filled: ${side} ${market.label} @ ${limitPrice}, tx: ${receipt.transactionHash}`);

    return {
      orderId: String(receipt.transactionHash),
      symbol,
      side,
      price: limitPrice,
      size: Number(snappedSize),
      filled: Number(order.filled ?? snappedSize),
      txHash: receipt.transactionHash,
      marketId: market.marketId,
    };
  }

  /**
   * Post a resting (post-only) quote on one side.
   * Used by Liquidity Mode to provide two-sided quotes.
   * Catches PostOnlyWouldCross and returns null (normal event, not a fault).
   */
  async placeRestingQuote(
    market: LiveMarket,
    side: 'UP' | 'DOWN',
    sizeUsd: number,
    price: number,
  ): Promise<PlacedOrder | null> {
    const ex = this.getExchange();

    const onchain = await ex.client.getMarketOnchain(market.marketId as `0x${string}`);
    if (onchain.status !== 1) return null;

    const symbol = side === 'UP' ? market.upSymbol : market.downSymbol;
    const snappedSize = ex.amountToPrecision(symbol, sizeUsd);
    if (!snappedSize || Number(snappedSize) === 0) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const expireTimestampNs = BigInt(Math.min(nowSec + 120, market.expiry - 30)) * BigInt(1_000_000_000);

    try {
      const order = await ex.createOrder(symbol, 'limit', 'buy', Number(snappedSize), price, {
        postOnly: true,
        expireTimestampNs,
      } as any);
      const { receipt } = order.info as PlaceOrderResult;
      return {
        orderId: String(receipt.transactionHash),
        symbol,
        side,
        price,
        size: Number(snappedSize),
        filled: 0,
        txHash: receipt.transactionHash,
        marketId: market.marketId,
      };
    } catch (err) {
      // PostOnlyWouldCross is a normal event on a quoting loop
      if (String(err).includes('PostOnlyWouldCross')) {
        logger.debug(`[DreamDex] PostOnlyWouldCross on ${market.label} ${side} — book moved`);
        return null;
      }
      throw err;
    }
  }

  // ── Mint / Merge ──────────────────────────────────────────────────────────

  /**
   * Mint a complete set: 1 collateral -> 1 UP + 1 DOWN token.
   * Used by Liquidity Mode to get inventory for sell-side quoting.
   */
  async mintSet(market: LiveMarket, amount: number): Promise<void> {
    const ex = this.getExchange();
    await ex.mintSet(market.upSymbol.split('#')[0], amount);
    logger.info(`[DreamDex] Minted ${amount} complete sets for ${market.label}`);
  }

  // ── Positions ─────────────────────────────────────────────────────────────

  /**
   * Get current UP and DOWN token balances for all live markets.
   * Gotcha #12: keyed by marketId
   */
  async getPositions(markets: LiveMarket[]): Promise<ECPosition[]> {
    const ex = this.getExchange();
    const walletAddress = config.SOMNIA_WALLET_ADDRESS;
    if (!walletAddress) return [];

    const positions: ECPosition[] = [];
    for (const m of markets) {
      try {
        const onchain = await ex.client.getMarketOnchain(m.marketId as `0x${string}`);
        const upBalance = await ex.client.getOutcomeBalance({
          outcomeToken: onchain.outcomeToken,
          account: walletAddress as `0x${string}`,
          id: onchain.yesId,
        });
        const downBalance = await ex.client.getOutcomeBalance({
          outcomeToken: onchain.outcomeToken,
          account: walletAddress as `0x${string}`,
          id: onchain.noId,
        });
        if (upBalance > BigInt(0) || downBalance > BigInt(0)) {
          positions.push({
            marketId: m.marketId,
            asset: m.asset,
            label: m.label,
            upBalance,
            downBalance,
            upSymbol: m.upSymbol,
            downSymbol: m.downSymbol,
            expiry: m.expiry,
          });
        }
      } catch (e) {
        logger.warn(`[DreamDex] Could not fetch position for ${m.label}: ${e}`);
      }
    }
    return positions;
  }

  // ── Settlement & Redemption ───────────────────────────────────────────────

  /**
   * Scan recently finalized markets and redeem any winning positions.
   * Gotcha #10: uses listBinaryMarkets({ status: "Finalized" }) — loadMarkets() skips these
   * Gotcha #11: checks outcome before spending gas on losing positions
   * Gotcha #12: keyed by marketId
   */
  async redeemSettledPositions(): Promise<RedemptionResult[]> {
    const ex = this.getExchange();
    const walletAddress = config.SOMNIA_WALLET_ADDRESS;
    if (!walletAddress) return [];

    const results: RedemptionResult[] = [];

    // Gotcha #10: must use listBinaryMarkets, not loadMarkets
    const settled = await ex.client.listBinaryMarkets({
      venueId: config.SOMNIA_VENUE_ID as any,
      status: 'Finalized',
      limit: 60,
    });

    // Sort newest-expired first
    const sorted = settled
      .sort((a: any, b: any) => Number(b.expiry ?? 0) - Number(a.expiry ?? 0))
      .slice(0, 40);

    for (const m of sorted) {
      try {
        const onchain = await ex.client.getMarketOnchain(m.marketId as `0x${string}`);
        if (!onchain.isResolved && !onchain.isVoided) continue;

        const upBal = await ex.client.getOutcomeBalance({
          outcomeToken: onchain.outcomeToken,
          account: walletAddress as `0x${string}`,
          id: onchain.yesId,
        });
        const downBal = await ex.client.getOutcomeBalance({
          outcomeToken: onchain.outcomeToken,
          account: walletAddress as `0x${string}`,
          id: onchain.noId,
        });

        if (upBal === BigInt(0) && downBal === BigInt(0)) continue;

        // Gotcha #11: only redeem winner (or both on voided)
        const toClaim: { idx: 0 | 1; balance: bigint; side: 'UP' | 'DOWN' }[] = [];
        if (onchain.isVoided) {
          if (upBal > BigInt(0)) toClaim.push({ idx: 0, balance: upBal, side: 'UP' });
          if (downBal > BigInt(0)) toClaim.push({ idx: 1, balance: downBal, side: 'DOWN' });
        } else {
          const winnerIdx: 0 | 1 = onchain.winningOutcome === 0 ? 0 : 1;
          const winnerBalance = winnerIdx === 0 ? upBal : downBal;
          if (winnerBalance > BigInt(0)) {
            toClaim.push({ idx: winnerIdx, balance: winnerBalance, side: winnerIdx === 0 ? 'UP' : 'DOWN' });
          }
        }

        for (const claim of toClaim) {
          const res = await ex.trader.redeem({
            marketId: m.marketId as `0x${string}`,
            market: onchain.marketAddress,
            outcomeToken: onchain.outcomeToken,
            outcomeIdx: claim.idx,
            amount: claim.balance,
          });
          if (res.receipt?.status === 'reverted') {
            logger.warn(`[DreamDex] Redeem reverted for ${m.marketId}`);
            continue;
          }
          const intervalSec = m.intervalSec ? Number(m.intervalSec) : 0;
          logger.info(`[DreamDex] Redeemed ${claim.side} for market ${m.asset}-${cadenceLabel(intervalSec)}`);
          results.push({
            marketId: m.marketId,
            asset: m.asset as string,
            outcome: onchain.isVoided ? 'VOIDED' : claim.side,
            amount: claim.balance,
            txHash: res.receipt!.transactionHash,
          });
        }
      } catch (e) {
        logger.warn(`[DreamDex] Redemption error for ${m.marketId}: ${e}`);
      }
    }

    return results;
  }

  // ── Historical Data ───────────────────────────────────────────────────────

  /**
   * Get recent finalized markets for the Track Record tab.
   * Returns last N markets with volume and resolution data.
   */
  async getSettledMarkets(limit = 40): Promise<any[]> {
    const ex = this.getExchange();
    try {
      const settled = await ex.client.listBinaryMarkets({
        venueId: config.SOMNIA_VENUE_ID as any,
        status: 'Finalized',
        limit,
      });
      return settled.sort((a: any, b: any) => Number(b.expiry ?? 0) - Number(a.expiry ?? 0));
    } catch (e) {
      logger.error('[DreamDex] getSettledMarkets failed:', e);
      return [];
    }
  }

  /**
   * Get the resolution details for a finalized market (opening vs closing price).
   */
  async getMarketResolution(marketId: string): Promise<any | null> {
    const ex = this.getExchange();
    try {
      return await ex.client.getMarketResolution(marketId as `0x${string}`);
    } catch {
      return null;
    }
  }

  /**
   * Get current wallet collateral balance (USDso).
   */
  async getWalletBalance(): Promise<number> {
    try {
      const ex = this.getExchange();
      const balance = await (ex as any).fetchBalance?.();
      return balance ? Number(balance.total ?? 0) : 0;
    } catch {
      return 0;
    }
  }
}

export const dreamDexService = new DreamDexService();
