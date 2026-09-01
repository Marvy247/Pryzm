# PRYZM — Master Implementation Overview
## Senior Engineer Specification for Execution Agent

---

## Project Identity

- **New name**: Pryzm (replace every instance of "Rogue", "ROGUE", "RogueAgent" in user-facing strings, page titles, component names, and the README — but do NOT rename backend file paths or existing DB tables to avoid breakage)
- **Tagline**: "Autonomous AI Oracle for DreamDEX Event Contracts"
- **Hackathon**: Somnia × DreamDEX Event Contracts Hackathon (DoraHacks, deadline ~8 Sep 2026)
- **Prize**: $5,000 USDso pool
- **Repo root**: `/home/marvi/Documents/RogueAgent`

---

## What This Project Is

Pryzm is a transformation of the existing RogueAgent multi-agent crypto trading system into an autonomous AI-powered prediction market trading agent that operates on **DreamDEX Event Contracts** on the **Somnia testnet**.

DreamDEX Event Contracts are binary Up/Down prediction markets on BTC and ETH with fixed time windows (15-minute and 1-hour). Prices are probabilities between 0 and 1. The agent discovers live markets, computes fair probability using multi-signal analysis, detects mispriced markets (edge), places orders via the `@somnia-chain/markets-sdk`, monitors positions, and automatically redeems winning positions after settlement.

---

## Prompt Files — Execution Order

The execution agent must implement the files **in this exact order**. Each file is self-contained with all context needed. Do not skip steps.

| File | What it covers | Must finish before |
|------|---------------|-------------------|
| `01-backend-foundation.md` | SDK install, `dreamdex.service.ts`, env config, Supabase schema additions | Everything else |
| `02-agents.md` | All 7 EC agent definitions (AgentBuilder pattern) | `03-orchestrator.md` |
| `03-orchestrator.md` | EC Orchestrator full lifecycle loop | `04-api-routes.md` |
| `04-api-routes.md` | New Express API endpoints for EC data | `05-frontend.md` |
| `05-frontend.md` | Full dashboard UI — EventContractsPage, market cards, probability scorecard, track record | `06-demo-mode.md` |
| `06-demo-mode.md` | Demo mode, RGE gating bypass, branding rename | Final step |

---

## Core Architecture

### What to KEEP from RogueAgent (reuse unchanged)
- `AgentBuilder` / `createTool` / `AiSdkLlm` pattern from `@iqai/adk`
- `llm.config.ts` — GPT-4o + Grok LLM setup
- `supabase.service.ts` — DB client
- `ta.util.ts` — all TA math (CVD, RSI, MACD, SuperTrend, Bollinger, Fibonacci, EMA)
- `binance.service.ts` — OHLCV data for BTC and ETH (15m, 1h intervals)
- `tavily.service.ts` — news/sentiment search
- `telegram.service.ts` — notifications (keep, repurpose for EC alerts)
- `retry.util.ts`, `logger.util.ts`, `text.util.ts`
- `ChainOfThoughtModal.tsx` — adapt as "Explain This Trade" modal
- `Countdown.tsx` — adapt for market expiry countdowns
- `DashboardLayout.tsx` — keep layout unchanged
- `GatedContent.tsx` — keep but modify gating logic (see `06-demo-mode.md`)
- All existing pages (Signals, Intel, Yield, Airdrops, etc.) — do NOT remove them

### What to ADD (new files only — do not modify existing files unless specified)
```
backend/src/
├── services/
│   ├── dreamdex.service.ts          ← Core SDK wrapper (primary new file)
│   └── ec-settlement.service.ts     ← Auto-redemption background service
├── agents/
│   ├── ec-market-scanner.agent.ts
│   ├── ec-edge-calculator.agent.ts
│   ├── ec-sentiment.agent.ts
│   ├── ec-orderbook.agent.ts
│   ├── ec-risk.agent.ts
│   ├── ec-executor.agent.ts
│   └── ec-settlement.agent.ts
├── services/
│   └── ec-orchestrator.service.ts   ← Main orchestration loop
├── api/
│   └── event-contracts.controller.ts
└── config/
    └── somnia.config.ts

frontend/src/
├── pages/
│   └── EventContractsPage.tsx       ← Main new page
├── components/
│   ├── MarketCard.tsx               ← Live market probability card
│   ├── ProbabilityScorecard.tsx     ← Signal evidence breakdown
│   └── TrackRecord.tsx              ← Historical performance from chain
└── services/
    └── event-contracts.service.ts   ← API calls for EC data
```

### What to REPLACE
- `backend/src/api/routes.ts` — add new EC routes (do not remove existing routes)
- `frontend/src/App.tsx` — add new route for `/app/event-contracts`
- `frontend/src/components/layout/DashboardLayout.tsx` — add nav item for Event Contracts

---

## Technology Constraints

### DreamDEX SDK (CRITICAL — read carefully)
- Package: `@somnia-chain/markets-sdk` version `0.28.1` (already latest on npm)
- Also install: `viem` (if not present)
- SDK version must be **≥ 0.28.0** — below this, float prices fail on 18-decimal venues
- Prices are **probabilities in (0, 1)** — UP price, DOWN = `1 - UP`
- `priceToPrecision()` and `amountToPrecision()` handle tick/lot grid snapping automatically from 0.28.0
- Order expiry is in **nanoseconds**, mandatory, max = market's own expiry

### Somnia Testnet Config
```typescript
// somnia.config.ts
export const SOMNIA_TESTNET = {
  chainId: 50312,
  rpcUrl: 'https://dream-rpc.somnia.network',
  wsRpcUrl: 'wss://dream-rpc.somnia.network/ws',
  indexerUrl: 'https://indexer.dreamdex.io',
  addresses: {
    // These come from the SDK — do NOT hardcode; use exchange.addresses after init
  }
};
```

### The 13 SDK Gotchas (agent must handle ALL of these — see `01-backend-foundation.md`)
1. Gate every write on `onchain.status === 1` (Trading), not indexer status
2. From SDK 0.23.0+, reverted writes throw — let them propagate, don't check status flags
3. Use SDK ≥ 0.28.0 so `priceToPrecision` handles the tick grid
4. IOC orders for taker-style bot (unfilled remainder never rests silently)
5. `expireTimestampNs` is mandatory in nanoseconds, must be ≤ market expiry
6. `amountToPrecision` handles lot grid from SDK 0.24.0+; check result ≠ 0 before sending
7. Check wallet balance before signing; underfunded bot keeps sending reverts and wasting gas
8. Scope to the venue — filter by `venueId` so you don't trade unintended markets
9. Skip markets with < 5 minutes remaining (lock risk)
10. `loadMarkets()` skips finalized markets — use `listBinaryMarkets({ status: "Finalized" })` for redemption
11. Settlement fee is zero on DreamDEX; redeeming a losing position succeeds and pays 0
12. Key all state by `marketId`, never by pool address (pools are recycled)
13. Don't parse the question text — read `asset` and `intervalSec` typed fields instead

---

## Judging Criteria Mapping

Every implementation decision must serve one of these:

| Criterion | Weight | How Pryzm wins it |
|-----------|--------|-------------------|
| Technical Implementation | 25% | Full SDK lifecycle: discover → gate → analyze → trade → redeem. All 13 gotchas handled. Structured TypeScript, typed Zod schemas, error handling |
| Innovation & Originality | 20% | Probability Scorecard with quantified per-signal evidence. Liquidity Mode (mint/merge market making). 7-agent swarm specialized for binary markets |
| User Experience & Design | 20% | Live market cards with expiry countdown. "Explain This Trade" modal. Track Record tab with on-chain verified P&L |
| Business & Ecosystem Impact | 20% | Agent generates real trading volume. Liquidity Mode provides two-sided quotes. Track Record proves edge |
| Presentation & Demo | 15% | Demo mode with no wallet required. Live moving numbers during demo. Clear agent reasoning stream visible |

---

## Naming Conventions

- All new files: `ec-*.ts` prefix for backend agents/services
- New DB tables: `ec_` prefix
- Frontend components: PascalCase, e.g., `EventContractsPage`, `MarketCard`, `ProbabilityScorecard`
- The app name in UI: **Pryzm** (capital P, lowercase rest)
- Agent names in logs: `[EC-Scanner]`, `[EC-Edge]`, `[EC-Sentiment]`, `[EC-OrderBook]`, `[EC-Risk]`, `[EC-Executor]`, `[EC-Settlement]`

---

## Definition of Done

The implementation is complete when:
- [ ] `npm run dev` starts without errors in both `backend/` and `frontend/`
- [ ] The `/app/event-contracts` page loads and shows 4 live market cards (BTC-15m, BTC-1h, ETH-15m, ETH-1h)
- [ ] Each market card shows live UP/DOWN probability updating every 10 seconds
- [ ] Each market card has a working expiry countdown
- [ ] The agent can be triggered via POST `/api/ec/run` and logs appear in the dashboard terminal
- [ ] A full cycle completes: discover market → compute edge → place order → position appears in "Open Positions"
- [ ] The Track Record tab loads historical finalized markets
- [ ] The "Explain This Trade" modal opens for any position and shows the probability scorecard
- [ ] Wallet connection is NOT required to view the Event Contracts page (demo mode)
- [ ] All user-facing "Rogue" strings are replaced with "Pryzm"
