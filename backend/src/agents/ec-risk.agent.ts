import { AgentBuilder } from '@iqai/adk';
import { createTool } from '@iqai/adk';
import { llm } from '../config/llm.config';
const z = require('@iqai/adk/node_modules/zod');
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

    // Rule 2: Minimum time — need at least 60 seconds
    if (secondsLeft < 60) {
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
    const entryPrice = proposedSide === 'UP' ? impliedProbability : 1 - impliedProbability;
    const b = entryPrice > 0 ? (1 / entryPrice) - 1 : 1;
    const p = proposedSide === 'UP' ? fairProbability : 1 - fairProbability;
    const kelly = (p * (b + 1) - 1) / b;
    const kellyFraction = Math.max(0, Math.min(kelly, 0.25));

    // Rule 6: Wallet balance check
    const balance = await dreamDexService.getWalletBalance();
    const kellySizeUsd = balance * kellyFraction;
    const approvedSizeUsd = Math.min(MAX_POSITION, Math.max(1, kellySizeUsd));

    logger.info(`[EC-Risk] ${marketLabel} ${proposedSide}: kelly=${(kellyFraction*100).toFixed(1)}%, size=$${approvedSizeUsd.toFixed(2)}`);

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
  .withTools(checkRiskParametersTool);
