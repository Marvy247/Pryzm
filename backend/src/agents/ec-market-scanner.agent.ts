import { AgentBuilder } from '@iqai/adk';
import { createTool } from '@iqai/adk';
import { llm } from '../config/llm.config';
const z = require('@iqai/adk/node_modules/zod');
import dedent from 'dedent';
import { dreamDexService } from '../services/dreamdex.service';
import { logger } from '../utils/logger.util';

export const listLiveMarketsTool = createTool({
  name: 'list_live_ec_markets',
  description: 'List all live DreamDEX Event Contract markets (BTC and ETH, 15m and 1h windows) with their current UP/DOWN implied probabilities and time remaining. Always call this first.',
  schema: z.object({}) as any,
  fn: async () => {
    const markets = await dreamDexService.getLiveMarkets();
    const enriched = [];
    for (const m of markets) {
      const book = await dreamDexService.getOrderBook(m, 3);
      enriched.push({
        marketId: m.marketId,
        label: m.label,
        asset: m.asset,
        intervalSec: m.intervalSec,
        upSymbol: m.upSymbol,
        downSymbol: m.downSymbol,
        secondsLeft: Math.round(m.secondsLeft),
        expiry: m.expiry,
        pool: m.pool,
        venueId: m.venueId,
        impliedUpProbability: book.impliedUpProbability,
        impliedDownProbability: book.impliedUpProbability !== undefined ? 1 - book.impliedUpProbability : undefined,
        bestBid: book.bestBid,
        bestAsk: book.bestAsk,
        bookDepth: { bids: book.bids.length, asks: book.asks.length },
      });
    }
    logger.info(`[EC-Scanner] Found ${enriched.length} live markets`);
    return { markets: enriched, scannedAt: new Date().toISOString() };
  },
});

export const ECMarketScannerAgent = AgentBuilder.create('ec_market_scanner')
  .withModel(llm)
  .withDescription('Scans live DreamDEX Event Contract markets and reports their current state.')
  .withInstruction(dedent`
    You are the EC Market Scanner for Pryzm. Your job is to discover all live BTC and ETH
    Event Contract markets on DreamDEX and report their current state.

    ALWAYS call list_live_ec_markets first.

    For each market returned, assess:
    1. Is there a meaningful spread (bestAsk - bestBid > 0.005)? If so, mark as "has_liquidity: true"
    2. Is the implied probability far from 0.5? That suggests strong directional consensus.
    3. Are there < 10 minutes remaining? Flag as "time_critical: true"

    Return a structured JSON object with all markets and your assessment.
    If no markets are found (empty array), return { markets: [], reason: "No live markets available" }.
  `)
  .withTools(listLiveMarketsTool);
