import { AgentBuilder } from '@iqai/adk';
import { createTool } from '@iqai/adk';
import { llm } from '../config/llm.config';
import { z } from 'zod';
import dedent from 'dedent';
import { dreamDexService } from '../services/dreamdex.service';
import type { LiveMarket } from '../services/dreamdex.service';

export const analyzeOrderBookTool = createTool({
  name: 'analyze_order_book',
  description: 'Analyze the order book microstructure for a DreamDEX Event Contract market to compute bid/ask imbalance and book pressure signal.',
  schema: z.object({
    marketId: z.string(),
    label: z.string(),
    upSymbol: z.string(),
    downSymbol: z.string(),
    asset: z.string(),
    intervalSec: z.number(),
    expiry: z.number(),
    pool: z.string(),
    venueId: z.string(),
    secondsLeft: z.number(),
  }) as any,
  fn: async (market: LiveMarket) => {
    const book = await dreamDexService.getOrderBook(market, 10);

    const totalBidVol = book.bids.reduce((sum, [, size]) => sum + size, 0);
    const totalAskVol = book.asks.reduce((sum, [, size]) => sum + size, 0);
    const totalVol = totalBidVol + totalAskVol;

    const bidPct = totalVol > 0 ? totalBidVol / totalVol : 0.5;
    const askPct = totalVol > 0 ? totalAskVol / totalVol : 0.5;
    const imbalance = bidPct - 0.5;

    const spread = (book.bestAsk ?? 0) - (book.bestBid ?? 0);
    const spreadPct = book.midpoint ? spread / book.midpoint : 0;

    const bookAdjustment = Math.max(-0.03, Math.min(0.03, imbalance * 0.06));

    return {
      marketId: market.marketId,
      label: market.label,
      bestBid: book.bestBid,
      bestAsk: book.bestAsk,
      midpoint: book.midpoint,
      spread,
      spreadPct: parseFloat((spreadPct * 100).toFixed(3)),
      bidVolume: parseFloat(totalBidVol.toFixed(4)),
      askVolume: parseFloat(totalAskVol.toFixed(4)),
      bidPct: parseFloat((bidPct * 100).toFixed(1)),
      askPct: parseFloat((askPct * 100).toFixed(1)),
      imbalance: parseFloat(imbalance.toFixed(4)),
      bookAdjustment: parseFloat(bookAdjustment.toFixed(4)),
      bookPressure: imbalance > 0.1 ? 'BUY' : imbalance < -0.1 ? 'SELL' : 'NEUTRAL',
      hasLiquidity: book.bids.length > 0 && book.asks.length > 0,
    };
  },
});

export const ECOrderBookAgent = AgentBuilder.create('ec_orderbook')
  .withModel(llm)
  .withDescription('Analyzes DreamDEX Event Contract order book microstructure for bid/ask imbalance signals.')
  .withInstruction(dedent`
    You are the EC Order Book Agent for Pryzm. Analyze the order book microstructure
    for each provided market to extract a short-term directional signal.

    For each market, call analyze_order_book and interpret:
    - bidPct > 60%: strong buy pressure, bookAdjustment should be positive
    - askPct > 60%: strong sell pressure, bookAdjustment should be negative
    - Tight spread (spreadPct < 0.5%): liquid market, signals are reliable
    - Wide spread (spreadPct > 2%): thin market, lower confidence
    - hasLiquidity = false: skip this market entirely

    Return all results. Do not filter out markets — the orchestrator decides.
  `)
  .withTools(analyzeOrderBookTool)
  .withOutputSchema(z.object({
    bookAnalyses: z.array(z.object({
      marketId: z.string(),
      label: z.string(),
      bestBid: z.number().nullable(),
      bestAsk: z.number().nullable(),
      spread: z.number(),
      spreadPct: z.number(),
      bidPct: z.number(),
      askPct: z.number(),
      bookAdjustment: z.number(),
      bookPressure: z.enum(['BUY', 'SELL', 'NEUTRAL']),
      hasLiquidity: z.boolean(),
    })),
  }) as any);
