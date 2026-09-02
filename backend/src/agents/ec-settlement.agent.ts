import { AgentBuilder } from '@iqai/adk';
import { createTool } from '@iqai/adk';
import { llm } from '../config/llm.config';
const z = require('@iqai/adk/node_modules/zod');
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
      const { data: positions } = await supabaseService.getClient()
        .from('ec_positions')
        .select('*')
        .eq('market_id', r.marketId)
        .eq('status', 'open');

      for (const pos of positions ?? []) {
        const won = (r.outcome === 'UP' && pos.side === 'UP') ||
                    (r.outcome === 'DOWN' && pos.side === 'DOWN') ||
                    r.outcome === 'VOIDED';

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
      .lt('expiry', now - 120);

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
  .withTools(redeemSettledMarketsTool);
