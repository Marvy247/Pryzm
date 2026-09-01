import { AgentBuilder } from '@iqai/adk';
import { createTool } from '@iqai/adk';
import { llm } from '../config/llm.config';
import { z } from 'zod';
import dedent from 'dedent';
import { binanceService } from '../services/binance.service';
import { TechnicalAnalysis } from '../utils/ta.util';
import { logger } from '../utils/logger.util';

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
    const interval = intervalSec === 900 ? '15m' : '1h';
    const ohlcv = await binanceService.getOHLCV(asset, interval, 3);
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

    let fairProb = 0.5;
    const signals: Array<{ name: string; value: string; contribution: number; direction: 'bullish' | 'bearish' | 'neutral' }> = [];

    // Signal 1: RSI
    const rsiArr = TechnicalAnalysis.calculateRSI(closes, 14);
    const rsi = rsiArr[rsiArr.length - 1] ?? 50;
    let rsiContrib = 0;
    if (rsi < 35) { rsiContrib = +0.04; }
    else if (rsi < 45) { rsiContrib = +0.02; }
    else if (rsi > 65) { rsiContrib = -0.04; }
    else if (rsi > 55) { rsiContrib = -0.02; }
    fairProb += rsiContrib;
    signals.push({ name: 'RSI', value: rsi.toFixed(1), contribution: rsiContrib, direction: rsiContrib > 0 ? 'bullish' : rsiContrib < 0 ? 'bearish' : 'neutral' });

    // Signal 2: MACD
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

    // Signal 3: Trend (EMA20 slope)
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

    // Signal 4: Bollinger Band position
    const bbData = TechnicalAnalysis.calculateBollingerBands(closes, 20, 2);
    let bbContrib = 0;
    if (bbData && bbData.upper.length > 0) {
      const lastUpper = bbData.upper[bbData.upper.length - 1];
      const lastLower = bbData.lower[bbData.lower.length - 1];
      if (lastUpper !== lastLower) {
        const pctB = (currentPrice - lastLower) / (lastUpper - lastLower);
        if (pctB < 0.2) bbContrib = +0.03;
        else if (pctB > 0.8) bbContrib = -0.03;
      }
    }
    fairProb += bbContrib;
    signals.push({ name: 'Bollinger Band', value: bbContrib > 0 ? 'Near Lower Band' : bbContrib < 0 ? 'Near Upper Band' : 'Mid-Band', contribution: bbContrib, direction: bbContrib > 0 ? 'bullish' : bbContrib < 0 ? 'bearish' : 'neutral' });

    // Signal 5: Volume momentum
    const recentVol = volumes.slice(-3).reduce((a: number, b: number) => a + b, 0) / 3;
    const prevVol = volumes.slice(-8, -3).reduce((a: number, b: number) => a + b, 0) / 5;
    const volRatio = prevVol > 0 ? recentVol / prevVol : 1;
    const priceDirection = closes[closes.length - 1] > closes[closes.length - 4] ? 1 : -1;
    let volContrib = 0;
    if (volRatio > 1.3) volContrib = 0.02 * priceDirection;
    else if (volRatio > 1.1) volContrib = 0.01 * priceDirection;
    fairProb += volContrib;
    signals.push({ name: 'Volume Momentum', value: `${volRatio.toFixed(2)}x recent vs prior`, contribution: volContrib, direction: volContrib > 0 ? 'bullish' : volContrib < 0 ? 'bearish' : 'neutral' });

    // Signal 6: Recent price momentum
    const recentReturn = (closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5];
    let momContrib = 0;
    if (recentReturn > 0.005) momContrib = +0.02;
    else if (recentReturn > 0.001) momContrib = +0.01;
    else if (recentReturn < -0.005) momContrib = -0.02;
    else if (recentReturn < -0.001) momContrib = -0.01;
    fairProb += momContrib;
    signals.push({ name: 'Price Momentum', value: `${(recentReturn * 100).toFixed(3)}% (last 5 bars)`, contribution: momContrib, direction: momContrib > 0 ? 'bullish' : momContrib < 0 ? 'bearish' : 'neutral' });

    // Clamp fair probability to valid range
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
      hasEdge: absEdge * 100 >= 10,
      signals,
      currentPrice,
      computedAt: new Date().toISOString(),
    };
  },
});

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
