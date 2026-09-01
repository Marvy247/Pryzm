# PRYZM — Prompt 03: EC Orchestrator
## Full Lifecycle Loop + Settlement Background Service

**Prerequisite:** `01-backend-foundation.md` and `02-agents.md` must be complete.

---

## File: `backend/src/services/ec-orchestrator.service.ts`

This is the central loop that calls all 7 agents in sequence. It also manages the settlement background timer and exposes methods used by the API controller.

```typescript
// backend/src/services/ec-orchestrator.service.ts
//
// EC Orchestrator: the master loop that drives all Event Contract agent activity.
// Flow per cycle:
//   1. ECMarketScanner  → discover live markets + implied probabilities
//   2. ECSentiment      → BTC/ETH sentiment adjustment (runs in parallel with step 3)
//   3. ECEdgeCalculator → fair probability + scorecard per market
//   4. ECOrderBook      → bid/ask imbalance adjustment per market
//   5. Combine signals  → final edge = TA edge + sentiment adj + book adj
//   6. ECRisk           → approve/reject each trade + size it
//   7. ECExecutor       → execute approved trades
//   8. Log run to DB    → ec_runs table
//
// Settlement runs separately every 5 minutes via startSettlementTimer().

import { EventEmitter } from 'events';
import { ECMarketScannerAgent } from '../agents/ec-market-scanner.agent';
import { ECEdgeCalculatorAgent } from '../agents/ec-edge-calculator.agent';
import { ECSentimentAgent } from '../agents/ec-sentiment.agent';
import { ECOrderBookAgent } from '../agents/ec-orderbook.agent';
import { ECRiskAgent } from '../agents/ec-risk.agent';
import { ECExecutorAgent } from '../agents/ec-executor.agent';
import { ECSettlementAgent } from '../agents/ec-settlement.agent';
import { supabaseService } from './supabase.service';
import { dreamDexService } from './dreamdex.service';
import { logger } from '../utils/logger.util';
import { config } from '../config/env.config';

// ─── Log Types ────────────────────────────────────────────────────────────────

export interface ECLog {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
  data?: any;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

class ECOrchestratorService extends EventEmitter {
  private isRunning = false;
  private settlementTimer: NodeJS.Timeout | null = null;
  private runLogs: ECLog[] = [];
  private lastRunAt: Date | null = null;

  private log(message: string, type: ECLog['type'] = 'info', data?: any) {
    const entry: ECLog = { message, type, timestamp: Date.now(), data };
    this.runLogs.push(entry);
    logger.info(`[EC-Orchestrator] ${message}`);
    // Broadcast to any SSE listeners
    this.emit('log', entry);
  }

  // ── Main Cycle ─────────────────────────────────────────────────────────────

  async runCycle(): Promise<{ success: boolean; summary: string }> {
    if (this.isRunning) {
      return { success: false, summary: 'Cycle already running' };
    }

    this.isRunning = true;
    this.runLogs = [];
    const startedAt = new Date();

    // Create a DB run record
    const { data: runRecord } = await supabaseService.getClient()
      .from('ec_runs')
      .insert({ status: 'running', started_at: startedAt.toISOString() })
      .select()
      .single();
    const runId = runRecord?.id;

    let marketsScanned = 0;
    let edgesFound = 0;
    let ordersPlaced = 0;

    try {
      // ── Step 1: Scan live markets ──────────────────────────────────────────
      this.log('🔍 Scanning live DreamDEX Event Contract markets...', 'info');
      const { runner: scannerRunner } = await ECMarketScannerAgent.build();
      const scanResult: any = await scannerRunner.ask('Scan all live BTC and ETH Event Contract markets on DreamDEX.');

      if (!scanResult?.markets?.length) {
        this.log('No live markets found. Ending cycle.', 'warning');
        await this.finalizeRun(runId, 'completed', 0, 0, 0, this.runLogs);
        this.isRunning = false;
        this.lastRunAt = new Date();
        return { success: true, summary: 'No live markets available' };
      }

      marketsScanned = scanResult.markets.length;
      this.log(`✅ Found ${marketsScanned} live markets`, 'success', 
        scanResult.markets.map((m: any) => `${m.label}: implied UP = ${(m.impliedUpProbability * 100).toFixed(1)}%`));

      // ── Step 2 & 3 in parallel: Sentiment + Edge Calculator ──────────────
      this.log('📡 Running sentiment analysis and edge calculation in parallel...', 'info');

      const [sentimentResult, edgeResult] = await Promise.all([
        (async () => {
          try {
            const { runner } = await ECSentimentAgent.build();
            return await runner.ask('Analyze current BTC and ETH market sentiment for the next 15-60 minutes.');
          } catch (e) {
            this.log(`Sentiment agent failed: ${e}`, 'warning');
            return { btc: { sentimentAdjustment: 0 }, eth: { sentimentAdjustment: 0 } };
          }
        })(),
        (async () => {
          const { runner } = await ECEdgeCalculatorAgent.build();
          const prompt = `Compute fair probability and edge for these markets:\n${JSON.stringify(scanResult.markets.map((m: any) => ({
            marketId: m.marketId,
            label: m.label,
            asset: m.asset,
            intervalSec: m.intervalSec,
            impliedUpProbability: m.impliedUpProbability ?? 0.5,
          })), null, 2)}`;
          return await runner.ask(prompt) as any;
        })(),
      ]);

      this.log('✅ Edge calculation complete', 'success',
        edgeResult?.analyses?.map((a: any) => `${a.label}: fair=${(a.fairUpProbability*100).toFixed(1)}%, edge=${a.edgePercent.toFixed(1)}%`));

      // ── Step 4: Order Book Analysis ────────────────────────────────────────
      this.log('📊 Analyzing order book microstructure...', 'info');
      const { runner: bookRunner } = await ECOrderBookAgent.build();
      const bookResult: any = await bookRunner.ask(
        `Analyze order books for these markets:\n${JSON.stringify(scanResult.markets, null, 2)}`
      );

      // ── Step 5: Combine all signals ────────────────────────────────────────
      // Build final combined analysis per market
      const combinedAnalyses = (edgeResult?.analyses ?? []).map((analysis: any) => {
        const market = scanResult.markets.find((m: any) => m.marketId === analysis.marketId);
        const bookData = bookResult?.bookAnalyses?.find((b: any) => b.marketId === analysis.marketId);
        const sentiment = analysis.asset === 'BTC' ? (sentimentResult as any)?.btc : (sentimentResult as any)?.eth;

        const sentimentAdj = sentiment?.sentimentAdjustment ?? 0;
        const bookAdj = bookData?.bookAdjustment ?? 0;

        // Final fair probability = TA estimate + sentiment + book pressure
        const finalFairProb = Math.max(0.05, Math.min(0.95,
          analysis.fairUpProbability + sentimentAdj + bookAdj
        ));
        const finalEdge = finalFairProb - (analysis.impliedUpProbability ?? 0.5);
        const finalEdgePct = finalEdge * 100;
        const absFinalEdgePct = Math.abs(finalEdgePct);

        return {
          ...analysis,
          market,
          bookData,
          sentimentAdj,
          bookAdj,
          finalFairProbability: parseFloat(finalFairProb.toFixed(4)),
          finalEdge: parseFloat(finalEdge.toFixed(4)),
          finalEdgePercent: parseFloat(finalEdgePct.toFixed(2)),
          absFinalEdgePercent: parseFloat(absFinalEdgePct.toFixed(2)),
          finalRecommendedSide: finalEdge > 0 ? 'UP' : 'DOWN',
          hasFinalEdge: absFinalEdgePct >= config.EC_MIN_EDGE_PERCENT,
          // Augment signals array with sentiment and book entries
          signals: [
            ...(analysis.signals ?? []),
            { name: 'Sentiment', value: sentiment?.keyHeadlines?.[0] ?? 'No data', contribution: sentimentAdj, direction: sentimentAdj > 0 ? 'bullish' : sentimentAdj < 0 ? 'bearish' : 'neutral' },
            { name: 'Order Book Imbalance', value: `${bookData?.bidPct?.toFixed(1) ?? 50}% bids`, contribution: bookAdj, direction: bookAdj > 0 ? 'bullish' : bookAdj < 0 ? 'bearish' : 'neutral' },
          ],
        };
      });

      const edgyCandidates = combinedAnalyses.filter((a: any) => a.hasFinalEdge);
      edgesFound = edgyCandidates.length;

      if (edgyCandidates.length === 0) {
        this.log(`No edge found on any market (min threshold: ${config.EC_MIN_EDGE_PERCENT}%). Ending cycle.`, 'info');
        await this.finalizeRun(runId, 'completed', marketsScanned, 0, 0, this.runLogs);
        this.isRunning = false;
        this.lastRunAt = new Date();
        return { success: true, summary: `Scanned ${marketsScanned} markets, no edge found` };
      }

      this.log(`⚡ Found ${edgesFound} markets with edge ≥ ${config.EC_MIN_EDGE_PERCENT}%`, 'success',
        edgyCandidates.map((a: any) => `${a.label}: ${a.finalRecommendedSide} edge ${a.finalEdgePercent.toFixed(1)}%`));

      // ── Step 6: Risk Management ────────────────────────────────────────────
      this.log('⚖️ Running risk management checks...', 'info');
      const { runner: riskRunner } = await ECRiskAgent.build();
      const riskPrompt = `Check risk for these proposed trades:\n${JSON.stringify(
        edgyCandidates.map((a: any) => ({
          marketId: a.marketId,
          marketLabel: a.label,
          proposedSide: a.finalRecommendedSide,
          edgePercent: a.finalEdgePercent,
          fairProbability: a.finalFairProbability,
          impliedProbability: a.impliedUpProbability,
          secondsLeft: a.market?.secondsLeft ?? 999,
        })), null, 2)}`;
      const riskResult: any = await riskRunner.ask(riskPrompt);

      const approvedTrades = (riskResult?.riskAssessments ?? []).filter((r: any) => r.approved && r.approvedSizeUsd > 0);
      const rejectedTrades = (riskResult?.riskAssessments ?? []).filter((r: any) => !r.approved);

      rejectedTrades.forEach((t: any) => {
        this.log(`🚫 ${t.label} rejected: ${t.reason}`, 'warning');
      });

      if (approvedTrades.length === 0) {
        this.log('All trades rejected by risk manager. Ending cycle.', 'warning');
        await this.finalizeRun(runId, 'completed', marketsScanned, edgesFound, 0, this.runLogs);
        this.isRunning = false;
        this.lastRunAt = new Date();
        return { success: true, summary: `${edgesFound} edges found, all rejected by risk manager` };
      }

      this.log(`✅ ${approvedTrades.length} trades approved by risk manager`, 'success',
        approvedTrades.map((t: any) => `${t.label} ${t.side}: $${t.approvedSizeUsd}`));

      // ── Step 7: Execute trades ─────────────────────────────────────────────
      this.log('⚡ Executing approved trades...', 'info');
      const { runner: execRunner } = await ECExecutorAgent.build();

      // Build execution payload — join approved trades with their full analysis data
      const executionPayload = approvedTrades.map((approved: any) => {
        const analysis = combinedAnalyses.find((a: any) => a.marketId === approved.marketId);
        const market = analysis?.market;
        const bookData = analysis?.bookData;
        const side = approved.side ?? analysis?.finalRecommendedSide;
        const limitPrice = side === 'UP'
          ? (bookData?.bestAsk ?? (analysis?.impliedUpProbability + 0.02))
          : (1 - (bookData?.bestBid ?? (1 - analysis?.impliedUpProbability + 0.02)));

        return {
          market,
          side,
          sizeUsd: approved.approvedSizeUsd,
          limitPrice: parseFloat(limitPrice.toFixed(4)),
          fairProbability: analysis?.finalFairProbability,
          impliedProbability: analysis?.impliedUpProbability,
          edgePercent: analysis?.finalEdgePercent,
          scorecard: analysis?.signals ?? [],
          reasoning: `${analysis?.label} ${side}: fair prob ${(analysis?.finalFairProbability * 100).toFixed(1)}% vs implied ${(analysis?.impliedUpProbability * 100).toFixed(1)}%. Edge: ${analysis?.finalEdgePercent?.toFixed(1)}%. ${analysis?.signals?.filter((s: any) => Math.abs(s.contribution) > 0).map((s: any) => `${s.name}: ${s.contribution > 0 ? '+' : ''}${(s.contribution * 100).toFixed(1)}%`).join(', ')}`,
        };
      });

      const execResult: any = await execRunner.ask(
        `Execute these approved trades:\n${JSON.stringify(executionPayload, null, 2)}`
      );

      ordersPlaced = execResult?.totalExecuted ?? 0;

      execResult?.executions?.forEach((e: any) => {
        if (e.success) {
          this.log(`✅ Executed: ${e.label} ${e.side} @ ${e.price?.toFixed(4)}, $${e.sizeUsd}, tx: ${e.txHash}`, 'success');
        } else {
          this.log(`❌ Failed: ${e.label} — ${e.error}`, 'error');
        }
      });

      // ── Finalize ───────────────────────────────────────────────────────────
      const summary = `Scanned ${marketsScanned} markets, found ${edgesFound} edges, executed ${ordersPlaced} trades`;
      this.log(`🏁 Cycle complete: ${summary}`, 'success');

      await this.finalizeRun(runId, 'completed', marketsScanned, edgesFound, ordersPlaced, this.runLogs);
      this.lastRunAt = new Date();
      this.isRunning = false;
      return { success: true, summary };

    } catch (err) {
      const errMsg = String(err);
      this.log(`💥 Cycle failed: ${errMsg}`, 'error');
      await this.finalizeRun(runId, 'failed', marketsScanned, edgesFound, ordersPlaced, this.runLogs, errMsg);
      this.isRunning = false;
      this.lastRunAt = new Date();
      return { success: false, summary: errMsg };
    }
  }

  // ── Settlement Timer ────────────────────────────────────────────────────────

  startSettlementTimer(): void {
    if (this.settlementTimer) return;
    this.settlementTimer = setInterval(async () => {
      try {
        this.log('🔄 Running settlement scan...', 'info');
        const { runner } = await ECSettlementAgent.build();
        const result: any = await runner.ask('Scan and redeem all settled Event Contract positions.');
        if (result?.redemptions?.length > 0) {
          this.log(`💰 Redeemed ${result.redemptions.length} positions`, 'success', result.redemptions);
          this.emit('redemption', result.redemptions);
        }
      } catch (e) {
        logger.warn(`[EC-Orchestrator] Settlement scan failed: ${e}`);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    logger.info('[EC-Orchestrator] Settlement timer started (5m interval)');
  }

  stopSettlementTimer(): void {
    if (this.settlementTimer) {
      clearInterval(this.settlementTimer);
      this.settlementTimer = null;
    }
  }

  // ── Public Getters ──────────────────────────────────────────────────────────

  getRunLogs(): ECLog[] {
    return [...this.runLogs];
  }

  getStatus(): { isRunning: boolean; lastRunAt: string | null } {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt?.toISOString() ?? null,
    };
  }

  // ── DB Helper ───────────────────────────────────────────────────────────────

  private async finalizeRun(
    runId: string | undefined,
    status: 'completed' | 'failed',
    marketsScanned: number,
    edgesFound: number,
    ordersPlaced: number,
    logs: ECLog[],
    errorMessage?: string,
  ): Promise<void> {
    if (!runId) return;
    await supabaseService.getClient()
      .from('ec_runs')
      .update({
        status,
        completed_at: new Date().toISOString(),
        markets_scanned: marketsScanned,
        edges_found: edgesFound,
        orders_placed: ordersPlaced,
        logs: logs as any,
        error_message: errorMessage,
      })
      .eq('id', runId);
  }
}

export const ecOrchestrator = new ECOrchestratorService();
```

---

## Update `backend/src/index.ts`

Add the EC orchestrator startup code inside the `server.listen` callback, after the existing DreamDEX initialization:

```typescript
import { ecOrchestrator } from './services/ec-orchestrator.service';

// Inside server.listen callback, add after dreamDexService.initialize():

// Start EC Settlement Timer (every 5 minutes)
logger.info('Starting EC Settlement Timer');
ecOrchestrator.startSettlementTimer();

// Start EC Orchestrator cycle on interval
const ecIntervalMs = config.EC_RUN_INTERVAL_MINUTES * 60 * 1000;
logger.info(`Starting EC Orchestrator (Interval: ${config.EC_RUN_INTERVAL_MINUTES}m)`);
setInterval(() => {
  ecOrchestrator.runCycle().catch(err =>
    logger.error('EC orchestrator cycle failed:', err)
  );
}, ecIntervalMs);

// Run once after 30 seconds to let everything initialize
setTimeout(() => {
  ecOrchestrator.runCycle().catch(err =>
    logger.error('Initial EC cycle failed:', err)
  );
}, 30_000);
```

---

## Verification

After completing this file:

```bash
cd backend && npx tsc --noEmit
```

Also manually test the cycle can be instantiated without crashing:

```bash
cd backend && npx ts-node -e "
const { ecOrchestrator } = require('./src/services/ec-orchestrator.service');
console.log('Status:', ecOrchestrator.getStatus());
console.log('OK');
"
```
