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
