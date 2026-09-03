// backend/src/services/ec-orchestrator.service.ts
//
// EC Orchestrator: the master loop that drives all Event Contract agent activity.
// Flow per cycle:
//   1. ECMarketScanner  -> discover live markets + implied probabilities
//   2. ECSentiment      -> BTC/ETH sentiment adjustment (runs in parallel with step 3)
//   3. ECEdgeCalculator -> fair probability + scorecard per market
//   4. ECOrderBook      -> bid/ask imbalance adjustment per market
//   5. Combine signals  -> final edge = TA edge + sentiment adj + book adj
//   6. ECRisk           -> approve/reject each trade + size it
//   7. ECExecutor       -> execute approved trades
//   8. Log run to DB    -> ec_runs table
//
// Settlement runs separately every 5 minutes via startSettlementTimer().

import { EventEmitter } from 'events';
import { ECSentimentAgent } from '../agents/ec-sentiment.agent';
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
  private cycleCount = 0;

  private log(message: string, type: ECLog['type'] = 'info', data?: any) {
    const entry: ECLog = { message, type, timestamp: Date.now(), data };
    this.runLogs.push(entry);
    logger.info(`[EC-Orchestrator] ${message}`);
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
      // ── Step 0: Close all stale open positions (simulated trades expire each cycle) ──
      const { data: staleClosed } = await supabaseService.getClient()
        .from('ec_positions')
        .update({ status: 'expired', settled_at: new Date().toISOString() })
        .eq('status', 'open')
        .select('id');
      if (staleClosed && staleClosed.length > 0) {
        this.log(`Closed ${staleClosed.length} previous positions`, 'info');
      }

      // ── Step 1: Scan live markets ──────────────────────────────────────────
      this.log('Scanning live DreamDEX Event Contract markets...', 'info');

      // Bypass the LLM scanner agent — call the RPC scanner directly
      const liveMarkets = await dreamDexService.getLiveMarkets();
      const enrichedMarkets = [];
      for (const m of liveMarkets) {
        try {
          const book = await dreamDexService.getOrderBook(m, 3);
          enrichedMarkets.push({
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
            has_liquidity: book.bids.length > 0 && book.asks.length > 0,
            time_critical: m.secondsLeft < 600,
          });
        } catch (e) {
          this.log(`Failed to read book for ${m.label}: ${e}`, 'warning');
        }
      }

      const scanResult = { markets: enrichedMarkets, scannedAt: new Date().toISOString() };

      if (!scanResult.markets.length) {
        this.log('No live markets found. Ending cycle.', 'warning');
        await this.finalizeRun(runId, 'completed', 0, 0, 0, this.runLogs);
        this.isRunning = false;
        this.lastRunAt = new Date();
        return { success: true, summary: 'No live markets available' };
      }

      marketsScanned = scanResult.markets.length;
      this.log(`Found ${marketsScanned} live markets`, 'success',
        scanResult.markets.map((m: any) => `${m.label}: implied UP = ${(m.impliedUpProbability * 100).toFixed(1)}%`));

      // ── Step 2 & 3: Sentiment + Edge Calculator (sequential to avoid rate limits)
      this.log('Running sentiment analysis...', 'info');
      let sentimentResult: any = { btc: { sentimentAdjustment: 0 }, eth: { sentimentAdjustment: 0 } };
      try {
        const { runner: sentRunner } = await ECSentimentAgent.build();
        sentimentResult = await sentRunner.ask('Analyze current BTC and ETH market sentiment for the next 15-60 minutes.');
      } catch (e) {
        this.log(`Sentiment agent failed: ${e}`, 'warning');
      }

      // Small delay to avoid Groq TPM rate limit between sequential LLM calls
      await new Promise(r => setTimeout(r, 5000));

      this.log('Running edge calculation...', 'info');

      // Bypass LLM — call the TA tool directly for each market
      const { computeFairProbabilityTool } = await import('../agents/ec-edge-calculator.agent');
      const edgeAnalyses = [];
      for (const m of scanResult.markets) {
        try {
          const result = await (computeFairProbabilityTool as any).func({
            asset: m.asset,
            intervalSec: m.intervalSec,
            impliedUpProbability: m.impliedUpProbability ?? 0.5,
          });
          edgeAnalyses.push({ ...result, marketId: m.marketId, label: m.label });
        } catch (e) {
          this.log(`Edge calc failed for ${m.label}: ${e}`, 'warning');
          edgeAnalyses.push({
            marketId: m.marketId, label: m.label, asset: m.asset,
            fairUpProbability: 0.5, edgePercent: 0, signals: [],
          });
        }
      }
      const edgeResult = { analyses: edgeAnalyses };

      this.log('Edge calculation complete', 'success',
        edgeResult?.analyses?.map((a: any) => `${a.label}: fair=${((a.fairUpProbability ?? 0.5)*100).toFixed(1)}%, edge=${(a.edgePercent ?? 0).toFixed(1)}%`));

      // ── Step 4: Order Book Analysis ────────────────────────────────────────
      this.log('Analyzing order book microstructure...', 'info');
      await new Promise(r => setTimeout(r, 2000));

      // Bypass LLM — call the order book tool directly
      const { analyzeOrderBookTool } = await import('../agents/ec-orderbook.agent');
      const bookAnalyses = [];
      for (const m of scanResult.markets) {
        try {
          const result = await (analyzeOrderBookTool as any).func(m);
          bookAnalyses.push(result);
        } catch (e) {
          this.log(`Order book analysis failed for ${m.label}: ${e}`, 'warning');
          bookAnalyses.push({ marketId: m.marketId, bidPct: 50, bookAdjustment: 0 });
        }
      }
      const bookResult = { bookAnalyses };

      // ── Step 5: Combine all signals ────────────────────────────────────────
      const combinedAnalyses = (edgeResult?.analyses ?? []).map((analysis: any) => {
        const market = scanResult.markets.find((m: any) => m.marketId === analysis.marketId);
        const bookData = bookResult?.bookAnalyses?.find((b: any) => b.marketId === analysis.marketId);
        const sentiment = analysis.asset === 'BTC' ? (sentimentResult as any)?.btc : (sentimentResult as any)?.eth;

        const sentimentAdj = sentiment?.sentimentAdjustment ?? 0;
        const bookAdj = bookData?.bookAdjustment ?? 0;

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

      this.log(`Found ${edgesFound} markets with edge >= ${config.EC_MIN_EDGE_PERCENT}%`, 'success',
        edgyCandidates.map((a: any) => `${a.label}: ${a.finalRecommendedSide} edge ${a.finalEdgePercent.toFixed(1)}%`));
      // ── Step 6: Risk Management ────────────────────────────────────────────
      this.log('Running risk management checks...', 'info');

      // Bypass LLM — call risk tool directly for each candidate
      const { checkRiskParametersTool } = await import('../agents/ec-risk.agent');
      const riskAssessments = [];
      for (const a of edgyCandidates) {
        try {
          const result = await (checkRiskParametersTool as any).func({
            marketLabel: a.label,
            proposedSide: a.finalRecommendedSide,
            edgePercent: a.finalEdgePercent,
            fairProbability: a.finalFairProbability,
            impliedProbability: a.impliedUpProbability,
            secondsLeft: a.market?.secondsLeft ?? 999,
          });
          riskAssessments.push({ ...result, marketId: a.marketId, side: a.finalRecommendedSide, label: a.label });
        } catch (e) {
          this.log(`Risk check failed for ${a.label}: ${e}`, 'warning');
          riskAssessments.push({ approved: true, approvedSizeUsd: 2, side: a.finalRecommendedSide, label: a.label, marketId: a.marketId, reason: 'Risk tool failed, defaulting to min size' });
        }
      }
      const riskResult = { riskAssessments };

      const approvedTrades = (riskResult?.riskAssessments ?? []).filter((r: any) => r.approved && r.approvedSizeUsd > 0);
      const rejectedTrades = (riskResult?.riskAssessments ?? []).filter((r: any) => !r.approved);

      rejectedTrades.forEach((t: any) => {
        this.log(`${t.label} rejected: ${t.reason}`, 'warning');
      });

      if (approvedTrades.length === 0) {
        this.log('All trades rejected by risk manager. Ending cycle.', 'warning');
        await this.finalizeRun(runId, 'completed', marketsScanned, edgesFound, 0, this.runLogs);
        this.isRunning = false;
        this.lastRunAt = new Date();
        return { success: true, summary: `${edgesFound} edges found, all rejected by risk manager` };
      }

      this.log(`${approvedTrades.length} trades approved by risk manager`, 'success',
        approvedTrades.map((t: any) => `${t.label} ${t.side}: $${t.approvedSizeUsd}`));

      // ── Step 7: Execute trades ─────────────────────────────────────────────
      this.log('Executing approved trades...', 'info');

      const executions = [];
      for (const approved of approvedTrades) {
        const analysis = combinedAnalyses.find((a: any) => a.marketId === approved.marketId);
        const market = analysis?.market;
        if (!market) {
          executions.push({ success: false, label: approved.label, error: 'Market data not found' });
          continue;
        }
        const bookData = analysis?.bookData;
        const side = approved.side ?? analysis?.finalRecommendedSide;
        const limitPrice = side === 'UP'
          ? (bookData?.bestAsk || ((analysis?.impliedUpProbability ?? 0.5) + 0.02))
          : (1 - (bookData?.bestBid || (1 - (analysis?.impliedUpProbability ?? 0.5) + 0.02)));

        const simTxHash = '0x' + [...Array(64)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

        try {
          const { supabaseService } = await import('../services/supabase.service');
          const { error: dbErr } = await supabaseService.getClient()
            .from('ec_positions')
            .insert({
              market_id: market.marketId,
              asset: market.asset,
              label: market.label,
              side,
              size_usd: approved.approvedSizeUsd,
              entry_price: parseFloat(limitPrice.toFixed(4)),
              implied_prob_at_entry: analysis?.impliedUpProbability,
              fair_prob_at_entry: analysis?.finalFairProbability,
              edge_at_entry: (analysis?.finalEdgePercent ?? 0) / 100,
              up_symbol: market.upSymbol,
              down_symbol: market.downSymbol,
              expiry: market.expiry,
              status: 'open',
              tx_hash: simTxHash,
              reasoning: { scorecard: analysis?.signals ?? [], text: `${market.label} ${side}: fair ${(analysis?.finalFairProbability * 100).toFixed(1)}% vs implied ${(analysis?.impliedUpProbability * 100).toFixed(1)}%. Edge: ${analysis?.finalEdgePercent?.toFixed(1)}%` },
            });

          if (dbErr) {
            this.log(`DB insert failed for ${market.label}: ${dbErr.message}`, 'warning');
            executions.push({ success: false, label: market.label, error: dbErr.message });
          } else {
            this.log(`Executed: ${market.label} ${side} @ ${limitPrice.toFixed(4)}, $${approved.approvedSizeUsd}, tx: ${simTxHash} (simulated)`, 'success');
            executions.push({ success: true, label: market.label, side, price: limitPrice, sizeUsd: approved.approvedSizeUsd, txHash: simTxHash });
          }
        } catch (e) {
          this.log(`Execution failed for ${market.label}: ${e}`, 'error');
          executions.push({ success: false, label: market.label, error: String(e) });
        }
      }

      ordersPlaced = executions.filter((e: any) => e.success).length;
      const execResult = { executions, totalExecuted: ordersPlaced };

      // ── Finalize ───────────────────────────────────────────────────────────
      const summary = `Scanned ${marketsScanned} markets, found ${edgesFound} edges, executed ${ordersPlaced} trades`;
      this.log(`Cycle complete: ${summary}`, 'success');

      await this.finalizeRun(runId, 'completed', marketsScanned, edgesFound, ordersPlaced, this.runLogs);
      this.lastRunAt = new Date();
      this.cycleCount++;
      this.isRunning = false;
      return { success: true, summary };

    } catch (err) {
      const errMsg = String(err);
      this.log(`Cycle failed: ${errMsg}`, 'error');
      await this.finalizeRun(runId, 'failed', marketsScanned, edgesFound, ordersPlaced, this.runLogs, errMsg);
      this.isRunning = false;
      this.lastRunAt = new Date();
      this.cycleCount++;
      return { success: false, summary: errMsg };
    }
  }

  // ── Settlement Timer ────────────────────────────────────────────────────────

  startSettlementTimer(): void {
    if (this.settlementTimer) return;
    this.settlementTimer = setInterval(async () => {
      try {
        this.log('Running settlement scan...', 'info');
        const { runner } = await ECSettlementAgent.build();
        const result: any = await runner.ask('Scan and redeem all settled Event Contract positions.');
        if (result?.redemptions?.length > 0) {
          this.log(`Redeemed ${result.redemptions.length} positions`, 'success', result.redemptions);
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

  getStatus(): { isRunning: boolean; lastRunAt: string | null; cycleCount: number } {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt?.toISOString() ?? null,
      cycleCount: this.cycleCount,
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
