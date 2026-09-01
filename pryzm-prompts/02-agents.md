# PRYZM — Prompt 02: EC Agent Definitions
## All 7 Event Contract Agents

**Prerequisite:** `01-backend-foundation.md` must be complete before writing these files.

All agents follow the existing `AgentBuilder` pattern from `@iqai/adk`. Use the existing `llm` (GPT-4o) and `scannerLlm` (Grok) from `backend/src/config/llm.config.ts`. Import `createTool` the same way existing tools do.

---

## Agent 1: EC Market Scanner

**File:** `backend/src/agents/ec-market-scanner.agent.ts`

**Purpose:** Calls `dreamDexService.getLiveMarkets()` and enriches each market with order book data. Returns the 4 canonical markets (BTC-15m, BTC-1h, ETH-15m, ETH-1h) with their current implied probabilities.

```typescript
import { AgentBuilder } from '@iqai/adk';
import { createTool } from '@iqai/adk';
import { llm } from '../config/llm.config';
import { z } from 'zod';
import dedent from 'dedent';
import { dreamDexService } from '../services/dreamdex.service';
import { logger } from '../utils/logger.util';

// ── Tool: list live markets ──────────────────────────────────────────────────
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

// ── Agent ────────────────────────────────────────────────────────────────────
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
  .withTools(listLiveMarketsTool)
  .withOutputSchema(z.object({
    markets: z.array(z.object({
      marketId: z.string(),
      label: z.string(),
      asset: z.string(),
      intervalSec: z.number(),
      upSymbol: z.string(),
      downSymbol: z.string(),
      secondsLeft: z.number(),
      expiry: z.number(),
      pool: z.string(),
      venueId: z.string(),
      impliedUpProbability: z.number().nullable(),
      impliedDownProbability: z.number().nullable(),
      bestBid: z.number().nullable(),
      bestAsk: z.number().nullable(),
      has_liquidity: z.boolean(),
      time_critical: z.boolean(),
    })),
    scannedAt: z.string(),
    reason: z.string().optional(),
  }) as any);
```

---

## Agent 2: EC Edge Calculator

**File:** `backend/src/agents/ec-edge-calculator.agent.ts`

**Purpose:** The most important agent. For each market, it computes a **fair probability** using multiple quantifiable signals from existing Pryzm data sources, then compares it to the market's implied probability to find **edge**. Returns a full Probability Scorecard for each market.

```typescript
import { AgentBuilder } from '@iqai/adk';
import { createTool } from '@iqai/adk';
import { llm } from '../config/llm.config';
import { z } from 'zod';
import dedent from 'dedent';
import { binanceService } from '../services/binance.service';
import { TechnicalAnalysis } from '../utils/ta.util';
import { logger } from '../utils/logger.util';

// ── Tool: compute fair probability ──────────────────────────────────────────
export const computeFairProbabilityTool = createTool({
  name: 'compute_fair_probability',
  description: 'Compute a fair UP probability for a BTC or ETH Event Contract market using multi-signal technical analysis. Returns a probability scorecard with per-signal contributions.',
  schema: z.object({
    asset: z.enum(['BTC', 'ETH']).describe('The asset to analyze'),
    intervalSec: z.number().describe('Market window in seconds: 900 (15m) or 3600 (1h)'),
    impliedUpProbability: z.number().describe('Current market-implied UP probability from order book'),
  }) as any,
  fn: async ({ asset, intervalSec, impliedUpProbability }: {
    asset: 'BTC' | 'ETH';
    intervalSec: number;
    impliedUpProbability: number;
  }) => {
    // Use the interval to pick the right Binance OHLCV timeframe
    const interval = intervalSec === 900 ? '15m' : '1h';
    const ohlcv = await binanceService.getOHLCV(asset, interval, 3); // last 3 days
    const closes = ohlcv.map((c: any) => c.close);
    const volumes = ohlcv.map((c: any) => c.volume);

    if (closes.length < 20) {
      return {
        asset, intervalSec, impliedUpProbability,
        fairUpProbability: 0.5,
        edge: 0,
        signals: [],
        error: 'Insufficient OHLCV data',
      };
    }

    // Base probability starts at 0.5 (no edge)
    let fairProb = 0.5;
    const signals: Array<{ name: string; value: string; contribution: number; direction: 'bullish' | 'bearish' | 'neutral' }> = [];

    // ── Signal 1: RSI ──────────────────────────────────────────────────────
    const rsiArr = TechnicalAnalysis.calculateRSI(closes, 14);
    const rsi = rsiArr[rsiArr.length - 1] ?? 50;
    let rsiContrib = 0;
    if (rsi < 35) { rsiContrib = +0.04; } // Oversold → bullish
    else if (rsi < 45) { rsiContrib = +0.02; }
    else if (rsi > 65) { rsiContrib = -0.04; } // Overbought → bearish
    else if (rsi > 55) { rsiContrib = -0.02; }
    fairProb += rsiContrib;
    signals.push({ name: 'RSI', value: rsi.toFixed(1), contribution: rsiContrib, direction: rsiContrib > 0 ? 'bullish' : rsiContrib < 0 ? 'bearish' : 'neutral' });

    // ── Signal 2: MACD ─────────────────────────────────────────────────────
    const ema12 = TechnicalAnalysis.calculateEMA(closes, 12);
    const ema26 = TechnicalAnalysis.calculateEMA(closes, 26);
    const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
    const prevMacd = ema12[ema12.length - 2] - ema26[ema26.length - 2];
    const macdCrossed = macdLine > 0 && prevMacd <= 0;
    const macdDeathCross = macdLine < 0 && prevMacd >= 0;
    let macdContrib = 0;
    if (macdCrossed) macdContrib = +0.03;
    else if (macdDeathCross) macdContrib = -0.03;
    else if (macdLine > 0) macdContrib = +0.01;
    else if (macdLine < 0) macdContrib = -0.01;
    fairProb += macdContrib;
    signals.push({ name: 'MACD', value: macdCrossed ? 'Bullish Cross' : macdDeathCross ? 'Death Cross' : macdLine > 0 ? 'Above 0' : 'Below 0', contribution: macdContrib, direction: macdContrib > 0 ? 'bullish' : macdContrib < 0 ? 'bearish' : 'neutral' });

    // ── Signal 3: SuperTrend proxy (EMA slope) ─────────────────────────────
    const ema20 = TechnicalAnalysis.calculateEMA(closes, 20);
    const emaSlope = ema20[ema20.length - 1] - ema20[ema20.length - 4];
    const currentPrice = closes[closes.length - 1];
    const aboveEma = currentPrice > ema20[ema20.length - 1];
    let stContrib = 0;
    if (aboveEma && emaSlope > 0) stContrib = +0.03;
    else if (!aboveEma && emaSlope < 0) stContrib = -0.03;
    else if (aboveEma) stContrib = +0.01;
    else stContrib = -0.01;
    fairProb += stContrib;
    signals.push({ name: 'Trend (EMA20)', value: aboveEma ? `Above (slope ${emaSlope > 0 ? '+' : ''}${emaSlope.toFixed(2)})` : `Below (slope ${emaSlope.toFixed(2)})`, contribution: stContrib, direction: stContrib > 0 ? 'bullish' : 'bearish' });

    // ── Signal 4: Bollinger Band position ──────────────────────────────────
    const bbData = TechnicalAnalysis.calculateBollingerBands?.(closes, 20, 2);
    let bbContrib = 0;
    if (bbData) {
      const lastBb = bbData[bbData.length - 1];
      if (lastBb) {
        const pctB = (currentPrice - lastBb.lower) / (lastBb.upper - lastBb.lower);
        if (pctB < 0.2) bbContrib = +0.03; // Near lower band → bullish
        else if (pctB > 0.8) bbContrib = -0.03; // Near upper band → bearish
      }
    }
    fairProb += bbContrib;
    signals.push({ name: 'Bollinger Band', value: bbContrib > 0 ? 'Near Lower Band' : bbContrib < 0 ? 'Near Upper Band' : 'Mid-Band', contribution: bbContrib, direction: bbContrib > 0 ? 'bullish' : bbContrib < 0 ? 'bearish' : 'neutral' });

    // ── Signal 5: Volume momentum ──────────────────────────────────────────
    const recentVol = volumes.slice(-3).reduce((a: number, b: number) => a + b, 0) / 3;
    const prevVol = volumes.slice(-8, -3).reduce((a: number, b: number) => a + b, 0) / 5;
    const volRatio = prevVol > 0 ? recentVol / prevVol : 1;
    // Price direction + volume confirms momentum
    const priceDirection = closes[closes.length - 1] > closes[closes.length - 4] ? 1 : -1;
    let volContrib = 0;
    if (volRatio > 1.3) volContrib = 0.02 * priceDirection;
    else if (volRatio > 1.1) volContrib = 0.01 * priceDirection;
    fairProb += volContrib;
    signals.push({ name: 'Volume Momentum', value: `${volRatio.toFixed(2)}x recent vs prior`, contribution: volContrib, direction: volContrib > 0 ? 'bullish' : volContrib < 0 ? 'bearish' : 'neutral' });

    // ── Signal 6: Recent price momentum ───────────────────────────────────
    const recentReturn = (closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5];
    let momContrib = 0;
    if (recentReturn > 0.005) momContrib = +0.02;
    else if (recentReturn > 0.001) momContrib = +0.01;
    else if (recentReturn < -0.005) momContrib = -0.02;
    else if (recentReturn < -0.001) momContrib = -0.01;
    fairProb += momContrib;
    signals.push({ name: 'Price Momentum', value: `${(recentReturn * 100).toFixed(3)}% (last 5 bars)`, contribution: momContrib, direction: momContrib > 0 ? 'bullish' : momContrib < 0 ? 'bearish' : 'neutral' });

    // ── Clamp fair probability to valid range ──────────────────────────────
    fairProb = Math.max(0.05, Math.min(0.95, fairProb));

    const edge = fairProb - impliedUpProbability;
    const absEdge = Math.abs(edge);

    return {
      asset,
      intervalSec,
      impliedUpProbability,
      fairUpProbability: parseFloat(fairProb.toFixed(4)),
      fairDownProbability: parseFloat((1 - fairProb).toFixed(4)),
      edge: parseFloat(edge.toFixed(4)),
      edgePercent: parseFloat((edge * 100).toFixed(2)),
      absEdgePercent: parseFloat((absEdge * 100).toFixed(2)),
      recommendedSide: edge > 0 ? 'UP' : 'DOWN',
      hasEdge: absEdge * 100 >= 10, // 10% minimum edge threshold
      signals,
      currentPrice,
      computedAt: new Date().toISOString(),
    };
  },
});

// ── Agent ────────────────────────────────────────────────────────────────────
export const ECEdgeCalculatorAgent = AgentBuilder.create('ec_edge_calculator')
  .withModel(llm)
  .withDescription('Computes fair probability and edge for DreamDEX Event Contract markets using multi-signal TA analysis.')
  .withInstruction(dedent`
    You are the EC Edge Calculator for Pryzm. Your job is to compute fair probabilities
    for each live Event Contract market and identify where the market is mispriced.

    For each market passed to you:
    1. Call compute_fair_probability with the market's asset, intervalSec, and impliedUpProbability
    2. If hasEdge is true (absEdgePercent >= 10%), flag it as tradeable
    3. Summarize the scorecard: which signals are bullish vs bearish, total edge

    IMPORTANT:
    - Only recommend trading when absEdgePercent >= 10 (configurable threshold)
    - Edge can be positive (buy UP) or negative (buy DOWN)
    - The probability scorecard is the key output — it explains WHY the market is mispriced
    - Include ALL signals in the output even if their contribution is 0

    Return structured JSON. Be precise with numbers — these drive real trades.
  `)
  .withTools(computeFairProbabilityTool)
  .withOutputSchema(z.object({
    analyses: z.array(z.object({
      marketId: z.string(),
      label: z.string(),
      asset: z.string(),
      intervalSec: z.number(),
      impliedUpProbability: z.number(),
      fairUpProbability: z.number(),
      edge: z.number(),
      edgePercent: z.number(),
      absEdgePercent: z.number(),
      recommendedSide: z.enum(['UP', 'DOWN']),
      hasEdge: z.boolean(),
      signals: z.array(z.object({
        name: z.string(),
        value: z.string(),
        contribution: z.number(),
        direction: z.enum(['bullish', 'bearish', 'neutral']),
      })),
      currentPrice: z.number().optional(),
    })),
  }) as any);
```

---

## Agent 3: EC Sentiment Agent

**File:** `backend/src/agents/ec-sentiment.agent.ts`

**Purpose:** Searches Tavily for recent BTC and ETH news, returns a sentiment score and key headlines that adjust the edge calculator's probability estimate.

```typescript
import { AgentBuilder } from '@iqai/adk';
import { scannerLlm } from '../config/llm.config'; // Use Grok for web search
import { z } from 'zod';
import dedent from 'dedent';
import { searchTavilyTool } from './tools'; // Reuse existing Tavily tool

export const ECSentimentAgent = AgentBuilder.create('ec_sentiment')
  .withModel(scannerLlm) // Grok has built-in X/web search
  .withDescription('Analyzes current market sentiment for BTC and ETH to inform Event Contract probability estimates.')
  .withInstruction(dedent`
    You are the EC Sentiment Agent for Pryzm. Your job is to assess current
    market sentiment for BTC and ETH specifically in the context of short-term
    (15-minute to 1-hour) price direction.

    Search for:
    1. "Bitcoin price analysis" or "BTC technical analysis" — get latest views
    2. "Ethereum price today" or "ETH analysis" — same for ETH
    3. Any breaking crypto news that could move prices in the next 1 hour

    For each asset (BTC and ETH), return:
    - sentimentScore: number from -1.0 (very bearish) to +1.0 (very bullish)
    - sentimentAdjustment: probability adjustment (-0.05 to +0.05)
      * Very bullish (+0.8 to 1.0) → +0.03 to +0.05
      * Bullish (+0.3 to 0.8) → +0.01 to +0.03
      * Neutral (-0.3 to 0.3) → 0
      * Bearish (-0.3 to -0.8) → -0.01 to -0.03
      * Very bearish (-0.8 to -1.0) → -0.03 to -0.05
    - keyHeadlines: array of 2-3 most relevant headlines (strings)
    - catalysts: any specific upcoming events (e.g., "Fed speech in 2h", "ETF inflow data")

    IMPORTANT: Keep this short-term focused. A positive long-term outlook
    does NOT mean the next 15 minutes will be up. Focus on immediate catalysts.
  `)
  .withTools(searchTavilyTool)
  .withOutputSchema(z.object({
    btc: z.object({
      sentimentScore: z.number().min(-1).max(1),
      sentimentAdjustment: z.number().min(-0.05).max(0.05),
      keyHeadlines: z.array(z.string()),
      catalysts: z.array(z.string()),
    }),
    eth: z.object({
      sentimentScore: z.number().min(-1).max(1),
      sentimentAdjustment: z.number().min(-0.05).max(0.05),
      keyHeadlines: z.array(z.string()),
      catalysts: z.array(z.string()),
    }),
    searchedAt: z.string(),
  }) as any);
```

---

## Agent 4: EC Order Book Agent

**File:** `backend/src/agents/ec-orderbook.agent.ts`

**Purpose:** Analyzes order book microstructure — bid/ask imbalance, spread, and volume — to refine the probability estimate with a market-microstructure signal.

```typescript
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

    // Compute bid/ask total volume
    const totalBidVol = book.bids.reduce((sum, [, size]) => sum + size, 0);
    const totalAskVol = book.asks.reduce((sum, [, size]) => sum + size, 0);
    const totalVol = totalBidVol + totalAskVol;

    const bidPct = totalVol > 0 ? totalBidVol / totalVol : 0.5;
    const askPct = totalVol > 0 ? totalAskVol / totalVol : 0.5;
    const imbalance = bidPct - 0.5; // positive = more bids = buy pressure

    // Spread as % of price
    const spread = (book.bestAsk ?? 0) - (book.bestBid ?? 0);
    const spreadPct = book.midpoint ? spread / book.midpoint : 0;

    // Imbalance-based probability adjustment (max ±0.03)
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
```

---

## Agent 5: EC Risk Agent

**File:** `backend/src/agents/ec-risk.agent.ts`

**Purpose:** Given a proposed trade (side, size, edge), applies risk management rules and returns an approved position size. Hard limits: max drawdown, max per-trade size, Kelly criterion cap.

```typescript
import { AgentBuilder } from '@iqai/adk';
import { createTool } from '@iqai/adk';
import { llm } from '../config/llm.config';
import { z } from 'zod';
import dedent from 'dedent';
import { supabaseService } from '../services/supabase.service';
import { dreamDexService } from '../services/dreamdex.service';
import { config } from '../config/env.config';
import { logger } from '../utils/logger.util';

export const checkRiskParametersTool = createTool({
  name: 'check_risk_parameters',
  description: 'Check risk parameters and compute approved position size for a proposed EC trade. Returns approved size (0 = reject trade) and reasoning.',
  schema: z.object({
    marketLabel: z.string(),
    proposedSide: z.enum(['UP', 'DOWN']),
    edgePercent: z.number().describe('Edge in percent, e.g. 15.4 means 15.4%'),
    fairProbability: z.number().describe('Agent fair probability (0-1)'),
    impliedProbability: z.number().describe('Market implied probability (0-1)'),
    secondsLeft: z.number(),
  }) as any,
  fn: async ({ marketLabel, proposedSide, edgePercent, fairProbability, impliedProbability, secondsLeft }: any) => {
    const MAX_POSITION = config.EC_MAX_POSITION_SIZE_USD;
    const MAX_DRAWDOWN_PCT = config.EC_MAX_DRAWDOWN_PERCENT;
    const MIN_EDGE = config.EC_MIN_EDGE_PERCENT;

    // Rule 1: Minimum edge
    if (Math.abs(edgePercent) < MIN_EDGE) {
      return { approved: false, approvedSizeUsd: 0, reason: `Edge ${edgePercent.toFixed(1)}% below minimum ${MIN_EDGE}%` };
    }

    // Rule 2: Minimum time — need at least 5 minutes
    if (secondsLeft < 300) {
      return { approved: false, approvedSizeUsd: 0, reason: `Only ${secondsLeft}s remaining — too close to expiry` };
    }

    // Rule 3: Check drawdown from DB
    const { data: recentPositions } = await supabaseService.getClient()
      .from('ec_positions')
      .select('pnl_usd, status')
      .in('status', ['won', 'lost'])
      .order('created_at', { ascending: false })
      .limit(20);

    const totalPnl = (recentPositions ?? []).reduce((sum: number, p: any) => sum + (p.pnl_usd ?? 0), 0);
    if (totalPnl < -(MAX_POSITION * MAX_DRAWDOWN_PCT / 100 * 20)) {
      return { approved: false, approvedSizeUsd: 0, reason: `Max drawdown reached (recent P&L: $${totalPnl.toFixed(2)})` };
    }

    // Rule 4: No duplicate open positions on the same market
    const { data: openPos } = await supabaseService.getClient()
      .from('ec_positions')
      .select('id')
      .eq('status', 'open')
      .ilike('label', marketLabel);
    if ((openPos?.length ?? 0) > 0) {
      return { approved: false, approvedSizeUsd: 0, reason: `Already have open position on ${marketLabel}` };
    }

    // Rule 5: Kelly criterion (simplified)
    // f* = (p*(b+1) - 1) / b where b = (1/entryPrice - 1)
    const entryPrice = proposedSide === 'UP' ? impliedProbability : 1 - impliedProbability;
    const b = entryPrice > 0 ? (1 / entryPrice) - 1 : 1;
    const p = proposedSide === 'UP' ? fairProbability : 1 - fairProbability;
    const kelly = (p * (b + 1) - 1) / b;
    const kellyFraction = Math.max(0, Math.min(kelly, 0.25)); // Cap at 25% Kelly

    // Rule 6: Wallet balance check
    const balance = await dreamDexService.getWalletBalance();
    const kellySizeUsd = balance * kellyFraction;
    const approvedSizeUsd = Math.min(MAX_POSITION, Math.max(1, kellySizeUsd));

    logger.info(`[EC-Risk] ✅ ${marketLabel} ${proposedSide}: kelly=${(kellyFraction*100).toFixed(1)}%, size=$${approvedSizeUsd.toFixed(2)}`);

    return {
      approved: true,
      approvedSizeUsd: parseFloat(approvedSizeUsd.toFixed(2)),
      kellyFraction: parseFloat(kellyFraction.toFixed(4)),
      walletBalance: balance,
      reason: `Kelly ${(kellyFraction*100).toFixed(1)}% of $${balance.toFixed(2)} balance = $${approvedSizeUsd.toFixed(2)} (capped at $${MAX_POSITION})`,
    };
  },
});

export const ECRiskAgent = AgentBuilder.create('ec_risk')
  .withModel(llm)
  .withDescription('Applies risk management rules to proposed EC trades and returns approved position sizes.')
  .withInstruction(dedent`
    You are the EC Risk Agent for Pryzm. Your role is to protect capital by
    applying strict risk management to every proposed trade.

    For each proposed trade, call check_risk_parameters. If approved is false,
    return the trade with approvedSizeUsd = 0 and include the reason.

    Hard rules (NEVER override these):
    - Reject if edge < minimum threshold
    - Reject if < 5 minutes to expiry
    - Reject if max drawdown has been hit
    - Reject if duplicate position exists on same market
    - Cap position size using Kelly criterion

    Return all trades (approved and rejected) so the orchestrator can log everything.
  `)
  .withTools(checkRiskParametersTool)
  .withOutputSchema(z.object({
    riskAssessments: z.array(z.object({
      marketId: z.string(),
      label: z.string(),
      side: z.enum(['UP', 'DOWN']),
      approved: z.boolean(),
      approvedSizeUsd: z.number(),
      reason: z.string(),
      kellyFraction: z.number().optional(),
    })),
  }) as any);
```

---

## Agent 6: EC Executor Agent

**File:** `backend/src/agents/ec-executor.agent.ts`

**Purpose:** Executes approved trades by calling `dreamDexService.placeTakerOrder()`. Saves the position to Supabase with full scorecard data. Returns execution results with transaction hashes.

```typescript
import { AgentBuilder } from '@iqai/adk';
import { createTool } from '@iqai/adk';
import { llm } from '../config/llm.config';
import { z } from 'zod';
import dedent from 'dedent';
import { dreamDexService } from '../services/dreamdex.service';
import type { LiveMarket } from '../services/dreamdex.service';
import { supabaseService } from '../services/supabase.service';
import { logger } from '../utils/logger.util';

export const executeECTradeTool = createTool({
  name: 'execute_ec_trade',
  description: 'Execute an approved Event Contract trade on DreamDEX. Places an IOC taker order and saves the position to the database.',
  schema: z.object({
    market: z.object({
      marketId: z.string(),
      asset: z.string(),
      intervalSec: z.number(),
      label: z.string(),
      upSymbol: z.string(),
      downSymbol: z.string(),
      secondsLeft: z.number(),
      expiry: z.number(),
      pool: z.string(),
      venueId: z.string(),
    }),
    side: z.enum(['UP', 'DOWN']),
    sizeUsd: z.number(),
    limitPrice: z.number().describe('The price to cross at — use bestAsk for UP, bestBid for DOWN'),
    fairProbability: z.number(),
    impliedProbability: z.number(),
    edgePercent: z.number(),
    scorecard: z.array(z.object({
      name: z.string(),
      value: z.string(),
      contribution: z.number(),
      direction: z.string(),
    })).describe('Full probability scorecard from edge calculator'),
    reasoning: z.string().describe('Human-readable explanation of why this trade was taken'),
  }) as any,
  fn: async (params: any) => {
    const { market, side, sizeUsd, limitPrice, fairProbability, impliedProbability, edgePercent, scorecard, reasoning } = params;

    logger.info(`[EC-Executor] Executing ${side} on ${market.label} @ ${limitPrice}, size=$${sizeUsd}`);

    let result;
    try {
      result = await dreamDexService.placeTakerOrder(
        market as LiveMarket,
        side,
        sizeUsd,
        limitPrice,
      );
    } catch (err) {
      logger.error(`[EC-Executor] Trade failed: ${err}`);
      return {
        success: false,
        marketId: market.marketId,
        label: market.label,
        side,
        error: String(err),
      };
    }

    // Save to DB
    const { error: dbErr } = await supabaseService.getClient()
      .from('ec_positions')
      .insert({
        market_id: market.marketId,
        asset: market.asset,
        label: market.label,
        side,
        size_usd: sizeUsd,
        entry_price: result.price,
        implied_prob_at_entry: impliedProbability,
        fair_prob_at_entry: fairProbability,
        edge_at_entry: edgePercent / 100,
        up_symbol: market.upSymbol,
        down_symbol: market.downSymbol,
        expiry: market.expiry,
        status: 'open',
        tx_hash: result.txHash,
        reasoning: { scorecard, text: reasoning },
      });

    if (dbErr) logger.warn(`[EC-Executor] DB insert failed: ${dbErr.message}`);

    return {
      success: true,
      marketId: market.marketId,
      label: market.label,
      side,
      price: result.price,
      sizeUsd,
      filled: result.filled,
      txHash: result.txHash,
    };
  },
});

export const ECExecutorAgent = AgentBuilder.create('ec_executor')
  .withModel(llm)
  .withDescription('Executes approved DreamDEX Event Contract trades and records positions in the database.')
  .withInstruction(dedent`
    You are the EC Executor for Pryzm. You execute approved trades only.

    For each trade with approved = true and approvedSizeUsd > 0:
    1. Call execute_ec_trade with all required parameters
    2. Use the bestAsk as the limitPrice when buying UP
    3. Use (1 - bestBid) as the limitPrice when buying DOWN
       (because DOWN price = 1 - UP price)
    4. Include the full scorecard array and a clear reasoning string

    If execution fails, record the failure and continue to next trade.
    Never retry a failed trade in the same cycle.

    Return a summary of all execution attempts.
  `)
  .withTools(executeECTradeTool)
  .withOutputSchema(z.object({
    executions: z.array(z.object({
      success: z.boolean(),
      marketId: z.string(),
      label: z.string(),
      side: z.enum(['UP', 'DOWN']).optional(),
      price: z.number().optional(),
      sizeUsd: z.number().optional(),
      txHash: z.string().optional(),
      error: z.string().optional(),
    })),
    totalExecuted: z.number(),
    totalFailed: z.number(),
  }) as any);
```

---

## Agent 7: EC Settlement Agent

**File:** `backend/src/agents/ec-settlement.agent.ts`

**Purpose:** Scans finalized markets, redeems winning positions, and updates the database. Runs on a background timer every 5 minutes.

```typescript
import { AgentBuilder } from '@iqai/adk';
import { createTool } from '@iqai/adk';
import { llm } from '../config/llm.config';
import { z } from 'zod';
import dedent from 'dedent';
import { dreamDexService } from '../services/dreamdex.service';
import { supabaseService } from '../services/supabase.service';
import { logger } from '../utils/logger.util';

export const redeemSettledMarketsTool = createTool({
  name: 'redeem_settled_markets',
  description: 'Scan all recently finalized DreamDEX Event Contract markets, redeem any winning positions, and update position records in the database.',
  schema: z.object({}) as any,
  fn: async () => {
    logger.info('[EC-Settlement] Starting settlement scan...');

    const redemptions = await dreamDexService.redeemSettledPositions();

    // Update DB records for redeemed positions
    for (const r of redemptions) {
      // Find the open position in DB
      const { data: positions } = await supabaseService.getClient()
        .from('ec_positions')
        .select('*')
        .eq('market_id', r.marketId)
        .eq('status', 'open');

      for (const pos of positions ?? []) {
        const won = (r.outcome === 'UP' && pos.side === 'UP') ||
                    (r.outcome === 'DOWN' && pos.side === 'DOWN') ||
                    r.outcome === 'VOIDED';

        // PnL: winning UP/DOWN pays 1.0 per contract, entry was the probability price
        // e.g. paid 0.54 for UP, wins 1.0 → profit = 1.0 - 0.54 = 0.46 per unit
        const pnlPerUnit = won ? (1 - pos.entry_price) : -pos.entry_price;
        const pnlUsd = pnlPerUnit * pos.size_usd;

        await supabaseService.getClient()
          .from('ec_positions')
          .update({
            status: won ? 'won' : 'lost',
            pnl_usd: parseFloat(pnlUsd.toFixed(4)),
            settled_at: new Date().toISOString(),
          })
          .eq('id', pos.id);
      }
    }

    // Also mark expired positions that weren't redeemed (lost)
    const now = Math.floor(Date.now() / 1000);
    const { data: expiredOpen } = await supabaseService.getClient()
      .from('ec_positions')
      .select('*')
      .eq('status', 'open')
      .lt('expiry', now - 120); // 2 minutes past expiry

    for (const pos of expiredOpen ?? []) {
      await supabaseService.getClient()
        .from('ec_positions')
        .update({ status: 'expired' })
        .eq('id', pos.id);
      logger.warn(`[EC-Settlement] Marked position ${pos.id} on ${pos.label} as expired`);
    }

    logger.info(`[EC-Settlement] Processed ${redemptions.length} redemptions`);
    return {
      redemptions: redemptions.map(r => ({
        marketId: r.marketId,
        asset: r.asset,
        outcome: r.outcome,
        txHash: r.txHash,
      })),
      expiredCount: expiredOpen?.length ?? 0,
    };
  },
});

export const ECSettlementAgent = AgentBuilder.create('ec_settlement')
  .withModel(llm)
  .withDescription('Redeems winning DreamDEX Event Contract positions after market settlement.')
  .withInstruction(dedent`
    You are the EC Settlement Agent for Pryzm. Your job is to ensure
    that all winnings are claimed after markets settle.

    Call redeem_settled_markets on every run.

    After redemption, log what was claimed. If nothing was claimed, that is normal —
    report 0 redemptions.

    This agent runs every 5 minutes in the background. It is critical because
    unclaimed winnings are lost forever if the agent doesn't actively redeem them.
  `)
  .withTools(redeemSettledMarketsTool)
  .withOutputSchema(z.object({
    redemptions: z.array(z.object({
      marketId: z.string(),
      asset: z.string(),
      outcome: z.string(),
      txHash: z.string(),
    })),
    expiredCount: z.number(),
    message: z.string().optional(),
  }) as any);
```

---

## After Writing All 7 Agent Files

Run TypeScript check:
```bash
cd backend && npx tsc --noEmit
```

Fix any import errors. Common issues:
- `searchTavilyTool` is exported from `backend/src/agents/tools.ts` — verify the export name
- `scannerLlm` is exported from `backend/src/config/llm.config.ts` — verify it exists
- If `TechnicalAnalysis.calculateBollingerBands` doesn't exist, replace with a simple stddev calculation inline
