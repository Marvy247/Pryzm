# PRYZM — Prompt 04: API Routes
## New Express Endpoints for Event Contracts

**Prerequisite:** `03-orchestrator.md` must be complete.

---

## File: `backend/src/api/event-contracts.controller.ts`

```typescript
import { Router, Request, Response } from 'express';
import { ecOrchestrator } from '../services/ec-orchestrator.service';
import { dreamDexService } from '../services/dreamdex.service';
import { supabaseService } from '../services/supabase.service';
import { logger } from '../utils/logger.util';

const router = Router();

// GET /api/ec/markets
// Returns all live markets with implied probabilities
router.get('/markets', async (_req: Request, res: Response) => {
  try {
    const markets = await dreamDexService.getLiveMarkets();
    const enriched = await Promise.all(
      markets.map(async (m) => {
        const book = await dreamDexService.getOrderBook(m, 3).catch(() => null);
        return {
          ...m,
          impliedUpProbability: book?.impliedUpProbability ?? null,
          impliedDownProbability: book?.impliedUpProbability != null ? 1 - book.impliedUpProbability : null,
          bestBid: book?.bestBid ?? null,
          bestAsk: book?.bestAsk ?? null,
        };
      })
    );
    res.json({ markets: enriched });
  } catch (err) {
    logger.error('GET /ec/markets failed:', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/ec/run
// Trigger a manual orchestrator cycle
router.post('/run', async (_req: Request, res: Response) => {
  const status = ecOrchestrator.getStatus();
  if (status.isRunning) {
    return res.status(409).json({ error: 'Cycle already running' });
  }
  // Fire and forget — client polls /status for updates
  ecOrchestrator.runCycle().catch(err => logger.error('Manual EC run failed:', err));
  res.json({ message: 'EC cycle started', startedAt: new Date().toISOString() });
});

// GET /api/ec/status
// Returns orchestrator running state and last run time
router.get('/status', (_req: Request, res: Response) => {
  res.json(ecOrchestrator.getStatus());
});

// GET /api/ec/logs
// Returns logs from the current or most recent run
router.get('/logs', (_req: Request, res: Response) => {
  res.json({ logs: ecOrchestrator.getRunLogs() });
});

// GET /api/ec/logs/stream
// SSE endpoint — streams live logs to the dashboard terminal
router.get('/logs/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onLog = (log: any) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  };
  ecOrchestrator.on('log', onLog);

  // Send current logs immediately on connect
  ecOrchestrator.getRunLogs().forEach(log => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  });

  req.on('close', () => {
    ecOrchestrator.off('log', onLog);
  });
});

// GET /api/ec/positions
// Returns all open EC positions
router.get('/positions', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseService.getClient()
      .from('ec_positions')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ positions: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/ec/history
// Returns closed/won/lost positions for Track Record tab
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const { data, error } = await supabaseService.getClient()
      .from('ec_positions')
      .select('*')
      .in('status', ['won', 'lost', 'expired', 'voided'])
      .order('settled_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const totalPnl = (data ?? []).reduce((sum, p) => sum + (p.pnl_usd ?? 0), 0);
    const won = (data ?? []).filter(p => p.status === 'won').length;
    const lost = (data ?? []).filter(p => p.status === 'lost').length;
    const winRate = (won + lost) > 0 ? won / (won + lost) : null;

    res.json({
      positions: data ?? [],
      stats: { totalPnl, won, lost, winRate, total: data?.length ?? 0 },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/ec/track-record
// Returns finalized markets from DreamDEX chain for the Track Record tab
router.get('/track-record', async (_req: Request, res: Response) => {
  try {
    const settled = await dreamDexService.getSettledMarkets(40);
    res.json({ markets: settled });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/ec/wallet-balance
router.get('/wallet-balance', async (_req: Request, res: Response) => {
  try {
    const balance = await dreamDexService.getWalletBalance();
    res.json({ balance });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/ec/runs
// Recent orchestrator run history
router.get('/runs', async (_req: Request, res: Response) => {
  try {
    const { data } = await supabaseService.getClient()
      .from('ec_runs')
      .select('id, started_at, completed_at, status, markets_scanned, edges_found, orders_placed, error_message')
      .order('started_at', { ascending: false })
      .limit(20);
    res.json({ runs: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export const eventContractsController = router;
```

---

## Update `backend/src/api/routes.ts`

Add one import and one `router.use()` line. Do NOT remove any existing routes.

Add at the top with other imports:
```typescript
import { eventContractsController } from './event-contracts.controller';
```

Add before the final `export default router;`:
```typescript
// Event Contracts (DreamDEX / Somnia)
router.use('/ec', eventContractsController);
```

---

## Verification

```bash
cd backend && npx tsc --noEmit
```

Then start the backend and test:
```bash
curl http://localhost:3000/api/ec/markets
curl http://localhost:3000/api/ec/status
curl -X POST http://localhost:3000/api/ec/run
```
