# PRYZM — Prompt 05: Frontend Dashboard
## EventContractsPage, Market Cards, Probability Scorecard, Track Record

**Prerequisite:** `04-api-routes.md` must be complete.

---

## Step 1: API Service

**File:** `frontend/src/services/event-contracts.service.ts`

```typescript
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const api = axios.create({ baseURL: `${BASE}/api/ec` });

export const ecService = {
  getMarkets: () => api.get('/markets').then(r => r.data),
  getStatus: () => api.get('/status').then(r => r.data),
  getLogs: () => api.get('/logs').then(r => r.data),
  getPositions: () => api.get('/positions').then(r => r.data),
  getHistory: (limit = 50) => api.get(`/history?limit=${limit}`).then(r => r.data),
  getTrackRecord: () => api.get('/track-record').then(r => r.data),
  getWalletBalance: () => api.get('/wallet-balance').then(r => r.data),
  getRuns: () => api.get('/runs').then(r => r.data),
  triggerRun: () => api.post('/run').then(r => r.data),
  // SSE stream URL (used directly in EventSource)
  getLogsStreamUrl: () => `${BASE}/api/ec/logs/stream`,
};
```

---

## Step 2: MarketCard Component

**File:** `frontend/src/components/MarketCard.tsx`

This card shows a single live market. It has a live probability bar, expiry countdown, and an "Explain" button that opens the scorecard.

```tsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, TrendingDown, Zap } from 'lucide-react';

interface Signal {
  name: string;
  value: string;
  contribution: number;
  direction: 'bullish' | 'bearish' | 'neutral';
}

interface MarketCardProps {
  label: string;            // 'BTC-15m'
  asset: string;            // 'BTC'
  intervalSec: number;
  impliedUpProbability: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  secondsLeft: number;
  fairUpProbability?: number;
  edgePercent?: number;
  recommendedSide?: 'UP' | 'DOWN';
  signals?: Signal[];
  onExplain?: () => void;
}

export function MarketCard({
  label, asset, impliedUpProbability, bestBid, bestAsk,
  secondsLeft, fairUpProbability, edgePercent, recommendedSide,
  signals, onExplain,
}: MarketCardProps) {
  const [timeLeft, setTimeLeft] = useState(secondsLeft);

  useEffect(() => {
    setTimeLeft(secondsLeft);
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const urgency = timeLeft < 300; // < 5 minutes

  const upPct = impliedUpProbability != null ? (impliedUpProbability * 100).toFixed(1) : '—';
  const downPct = impliedUpProbability != null ? ((1 - impliedUpProbability) * 100).toFixed(1) : '—';
  const hasEdge = edgePercent != null && Math.abs(edgePercent) >= 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-3 hover:border-cyan-500/40 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-lg">{label}</span>
          {hasEdge && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              recommendedSide === 'UP'
                ? 'bg-green-900/50 text-green-400 border border-green-500/30'
                : 'bg-red-900/50 text-red-400 border border-red-500/30'
            }`}>
              {recommendedSide} EDGE {edgePercent != null ? `${Math.abs(edgePercent).toFixed(1)}%` : ''}
            </span>
          )}
        </div>
        <div className={`flex items-center gap-1 text-xs font-mono ${urgency ? 'text-red-400 animate-pulse' : 'text-gray-500'}`}>
          <Clock className="w-3 h-3" />
          {mins}:{secs.toString().padStart(2, '0')}
        </div>
      </div>

      {/* Probability Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-green-400" /> UP {upPct}%</span>
          <span className="flex items-center gap-1">DOWN {downPct}% <TrendingDown className="w-3 h-3 text-red-400" /></span>
        </div>
        <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
            style={{ width: `${upPct}%` }}
          />
        </div>
        {fairUpProbability != null && (
          <div className="flex justify-between text-xs text-gray-600">
            <span>Pryzm fair: <span className="text-cyan-400">{(fairUpProbability * 100).toFixed(1)}%</span></span>
            <span>Book mid: <span className="text-gray-400">{upPct}%</span></span>
          </div>
        )}
      </div>

      {/* Spread */}
      {bestBid != null && bestAsk != null && (
        <div className="flex gap-3 text-xs font-mono">
          <span className="text-green-400">BID {bestBid.toFixed(3)}</span>
          <span className="text-gray-600">|</span>
          <span className="text-red-400">ASK {bestAsk.toFixed(3)}</span>
          <span className="text-gray-600">spread {((bestAsk - bestBid) * 100).toFixed(2)}%</span>
        </div>
      )}

      {/* Explain button */}
      {signals && signals.length > 0 && onExplain && (
        <button
          onClick={onExplain}
          className="w-full flex items-center justify-center gap-2 text-xs text-cyan-400 border border-cyan-500/20 rounded-lg py-1.5 hover:bg-cyan-900/20 transition-colors"
        >
          <Zap className="w-3 h-3" />
          Explain This Trade
        </button>
      )}
    </motion.div>
  );
}
```

---

## Step 3: ProbabilityScorecard Component

**File:** `frontend/src/components/ProbabilityScorecard.tsx`

This is the "Explain This Trade" modal — the key innovation differentiator. Reuses the existing `ChainOfThoughtModal` styling.

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Signal {
  name: string;
  value: string;
  contribution: number;
  direction: 'bullish' | 'bearish' | 'neutral';
}

interface ProbabilityScorecardProps {
  isOpen: boolean;
  onClose: () => void;
  label: string;
  asset: string;
  impliedUpProbability: number;
  fairUpProbability: number;
  edgePercent: number;
  recommendedSide: 'UP' | 'DOWN';
  signals: Signal[];
}

export function ProbabilityScorecard({
  isOpen, onClose, label, impliedUpProbability,
  fairUpProbability, edgePercent, recommendedSide, signals,
}: ProbabilityScorecardProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-lg bg-black border border-cyan-500/30 rounded-xl overflow-hidden shadow-[0_0_40px_rgba(6,182,212,0.15)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-cyan-500/20 bg-cyan-900/10">
              <div>
                <h3 className="text-white font-bold text-lg">{label} — Probability Scorecard</h3>
                <p className="text-cyan-400/70 text-xs mt-0.5">Why Pryzm is taking this trade</p>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary */}
            <div className="px-5 py-4 border-b border-gray-800 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-gray-500 text-xs">Market Implied</p>
                <p className="text-white font-bold text-xl">{(impliedUpProbability * 100).toFixed(1)}%</p>
                <p className="text-gray-500 text-xs">UP probability</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Pryzm Estimate</p>
                <p className="text-cyan-400 font-bold text-xl">{(fairUpProbability * 100).toFixed(1)}%</p>
                <p className="text-gray-500 text-xs">fair probability</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Edge</p>
                <p className={`font-bold text-xl ${edgePercent > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {edgePercent > 0 ? '+' : ''}{edgePercent.toFixed(1)}%
                </p>
                <p className={`text-xs font-semibold ${edgePercent > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  BUY {recommendedSide}
                </p>
              </div>
            </div>

            {/* Signal Breakdown */}
            <div className="px-5 py-4 space-y-2 max-h-80 overflow-y-auto">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Signal Breakdown</p>
              {signals.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800/50">
                  <div className="flex items-center gap-2">
                    {s.direction === 'bullish' && <TrendingUp className="w-4 h-4 text-green-400 shrink-0" />}
                    {s.direction === 'bearish' && <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />}
                    {s.direction === 'neutral' && <Minus className="w-4 h-4 text-gray-500 shrink-0" />}
                    <div>
                      <p className="text-white text-sm font-medium">{s.name}</p>
                      <p className="text-gray-500 text-xs">{s.value}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold font-mono ${
                    s.contribution > 0 ? 'text-green-400' : s.contribution < 0 ? 'text-red-400' : 'text-gray-600'
                  }`}>
                    {s.contribution > 0 ? '+' : ''}{(s.contribution * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-gray-900/50 text-xs text-gray-600 text-center">
              Probabilities are Pryzm's estimates — not financial advice
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

---

## Step 4: TrackRecord Component

**File:** `frontend/src/components/TrackRecord.tsx`

```tsx
import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, TrendingUp } from 'lucide-react';
import { ecService } from '../services/event-contracts.service';

interface Position {
  id: string;
  label: string;
  asset: string;
  side: 'UP' | 'DOWN';
  size_usd: number;
  entry_price: number;
  fair_prob_at_entry: number;
  edge_at_entry: number;
  status: 'won' | 'lost' | 'expired' | 'voided';
  pnl_usd: number | null;
  settled_at: string | null;
  created_at: string;
}

interface Stats {
  totalPnl: number;
  won: number;
  lost: number;
  winRate: number | null;
  total: number;
}

export function TrackRecord() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ecService.getHistory(50).then(data => {
      setPositions(data.positions ?? []);
      setStats(data.stats ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading track record...</div>
  );

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total P&L', value: `${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`, color: stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400' },
            { label: 'Win Rate', value: stats.winRate != null ? `${(stats.winRate * 100).toFixed(0)}%` : '—', color: 'text-cyan-400' },
            { label: 'Wins', value: String(stats.won), color: 'text-green-400' },
            { label: 'Losses', value: String(stats.lost), color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-xs">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Position History */}
      <div className="space-y-2">
        {positions.length === 0 && (
          <div className="text-center text-gray-500 py-12 text-sm">No closed positions yet</div>
        )}
        {positions.map(p => (
          <div key={p.id} className="flex items-center justify-between bg-gray-900/40 border border-gray-800 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              {p.status === 'won' && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
              {p.status === 'lost' && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
              {(p.status === 'expired' || p.status === 'voided') && <Clock className="w-4 h-4 text-gray-500 shrink-0" />}
              <div>
                <p className="text-white text-sm font-medium">{p.label} — {p.side}</p>
                <p className="text-gray-500 text-xs">
                  Entry {(p.entry_price * 100).toFixed(1)}% · Fair {(p.fair_prob_at_entry * 100).toFixed(1)}% · Edge {(p.edge_at_entry * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-bold text-sm ${p.pnl_usd != null && p.pnl_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {p.pnl_usd != null ? `${p.pnl_usd >= 0 ? '+' : ''}$${p.pnl_usd.toFixed(2)}` : '—'}
              </p>
              <p className="text-gray-600 text-xs">{p.settled_at ? new Date(p.settled_at).toLocaleTimeString() : '—'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Step 5: Main EventContractsPage

**File:** `frontend/src/pages/EventContractsPage.tsx`

```tsx
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Play, Activity, History, Terminal, Cpu, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ecService } from '../services/event-contracts.service';
import { MarketCard } from '../components/MarketCard';
import { ProbabilityScorecard } from '../components/ProbabilityScorecard';
import { TrackRecord } from '../components/TrackRecord';

type Tab = 'markets' | 'positions' | 'track-record' | 'terminal';

interface MarketData {
  marketId: string;
  label: string;
  asset: string;
  intervalSec: number;
  upSymbol: string;
  downSymbol: string;
  secondsLeft: number;
  expiry: number;
  impliedUpProbability: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  // Enriched by edge agent (populated after a run)
  fairUpProbability?: number;
  edgePercent?: number;
  recommendedSide?: 'UP' | 'DOWN';
  signals?: any[];
}

interface Log { message: string; type: string; timestamp: number; data?: any; }

export function EventContractsPage() {
  const [tab, setTab] = useState<Tab>('markets');
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [scorecardData, setScorecardData] = useState<MarketData | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Load markets every 10 seconds
  useEffect(() => {
    const load = () => {
      ecService.getMarkets().then(d => setMarkets(d.markets ?? [])).catch(() => {});
      ecService.getStatus().then(d => { setIsRunning(d.isRunning); setLastRunAt(d.lastRunAt); }).catch(() => {});
      ecService.getWalletBalance().then(d => setBalance(d.balance)).catch(() => {});
    };
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  // Load positions when on positions tab
  useEffect(() => {
    if (tab === 'positions') {
      ecService.getPositions().then(d => setPositions(d.positions ?? [])).catch(() => {});
    }
  }, [tab]);

  // SSE log stream
  useEffect(() => {
    const url = ecService.getLogsStreamUrl();
    const es = new EventSource(url);
    sseRef.current = es;
    es.onmessage = (e) => {
      try {
        const log = JSON.parse(e.data);
        setLogs(prev => [...prev.slice(-200), log]);
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } catch {}
    };
    return () => es.close();
  }, []);

  const handleRunCycle = async () => {
    try {
      await ecService.triggerRun();
      toast.success('EC agent cycle started');
      setIsRunning(true);
      setTab('terminal');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to start cycle');
    }
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'markets', label: 'Live Markets', icon: Activity },
    { id: 'positions', label: 'Open Positions', icon: Cpu },
    { id: 'track-record', label: 'Track Record', icon: History },
    { id: 'terminal', label: 'Agent Terminal', icon: Terminal },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-cyan-500" />
            Event Contracts
          </h2>
          <p className="text-gray-400 mt-1 text-sm">
            Autonomous AI trading on DreamDEX · Somnia Testnet
            {balance != null && <span className="ml-3 text-cyan-500 font-mono">${balance.toFixed(2)} USDso</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRunAt && (
            <span className="text-gray-600 text-xs">Last run: {new Date(lastRunAt).toLocaleTimeString()}</span>
          )}
          <button
            onClick={handleRunCycle}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {isRunning
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running...</>
              : <><Play className="w-4 h-4" /> Run Agent</>
            }
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center ${
              tab === t.id
                ? 'bg-cyan-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <t.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'markets' && (
        <div className="space-y-4">
          {markets.length === 0 ? (
            <div className="text-center py-16 text-gray-500 text-sm">
              <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
              No live markets found. Markets may be between windows.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {markets.map(m => (
                <MarketCard
                  key={m.marketId}
                  {...m}
                  onExplain={m.signals?.length ? () => setScorecardData(m) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'positions' && (
        <div className="space-y-3">
          {positions.length === 0 ? (
            <div className="text-center py-16 text-gray-500 text-sm">No open positions</div>
          ) : positions.map(p => (
            <div key={p.id} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-white font-bold">{p.label} — {p.side}</p>
                <p className="text-gray-500 text-xs mt-1">
                  Entry: {(p.entry_price * 100).toFixed(1)}% · Size: ${p.size_usd} ·
                  Edge: {(p.edge_at_entry * 100).toFixed(1)}%
                </p>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full border ${
                  p.status === 'open' ? 'border-cyan-500/30 text-cyan-400 bg-cyan-900/20' : 'border-gray-700 text-gray-500'
                }`}>{p.status.toUpperCase()}</span>
                <p className="text-gray-600 text-xs mt-1">
                  Expires: {new Date(p.expiry * 1000).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'track-record' && <TrackRecord />}

      {tab === 'terminal' && (
        <div className="bg-black border border-cyan-500/20 rounded-xl overflow-hidden font-mono">
          <div className="flex items-center gap-2 px-4 py-3 bg-cyan-900/10 border-b border-cyan-500/20 text-cyan-400 text-sm">
            <Terminal className="w-4 h-4" />
            <span className="font-bold tracking-wider">PRYZM // EC_AGENT_CORE</span>
            {isRunning && <span className="ml-auto text-xs animate-pulse text-green-400">● RUNNING</span>}
          </div>
          <div className="p-4 h-96 overflow-y-auto space-y-1 bg-black/90">
            {logs.length === 0 && (
              <p className="text-gray-600 text-xs">Awaiting agent activity... Press "Run Agent" to start.</p>
            )}
            {logs.map((log, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className={`text-xs flex gap-3 ${
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'warning' ? 'text-yellow-400' :
                  'text-gray-400'
                }`}
              >
                <span className="opacity-40 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span>{log.message}</span>
              </motion.div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Probability Scorecard Modal */}
      {scorecardData && (
        <ProbabilityScorecard
          isOpen={!!scorecardData}
          onClose={() => setScorecardData(null)}
          label={scorecardData.label}
          asset={scorecardData.asset}
          impliedUpProbability={scorecardData.impliedUpProbability ?? 0.5}
          fairUpProbability={scorecardData.fairUpProbability ?? 0.5}
          edgePercent={scorecardData.edgePercent ?? 0}
          recommendedSide={scorecardData.recommendedSide ?? 'UP'}
          signals={scorecardData.signals ?? []}
        />
      )}
    </div>
  );
}
```

---

## Step 6: Wire into App routing

### `frontend/src/App.tsx`

Add import at top:
```tsx
import { EventContractsPage } from './pages/EventContractsPage';
```

Inside the `<Route path="/app" ...>` dashboard routes, add:
```tsx
<Route path="event-contracts" element={<EventContractsPage />} />
```

### `frontend/src/components/layout/DashboardLayout.tsx`

Find the existing nav items array (it contains items like Signals, Intel, Yield, etc.) and add:
```tsx
{
  path: '/app/event-contracts',
  label: 'Event Contracts',
  icon: Activity, // import Activity from 'lucide-react'
}
```

Place it right after the Futures Agents nav item, or as the second item if you want it prominent.

---

## Verification

```bash
cd frontend && npm run build
```

Zero TypeScript errors. Then `npm run dev` and navigate to `/app/event-contracts`. The page should load with 4 market cards showing live data.
