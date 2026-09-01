# Pryzm | Autonomous AI Oracle for DreamDEX Event Contracts

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Somnia](https://img.shields.io/badge/Network-Somnia_Testnet-8B5CF6?style=for-the-badge)](https://somnia.network/)
[![DreamDEX](https://img.shields.io/badge/Exchange-DreamDEX-00D4FF?style=for-the-badge)](https://dreamdex.io/)

**Autonomous 7-agent AI swarm that discovers, analyzes, trades, and redeems DreamDEX Event Contracts on Somnia testnet.**

</div>

---

## What is Pryzm?

Pryzm is a purpose-built autonomous AI trading agent for **DreamDEX Event Contracts** on the Somnia network. It operates a coordinated swarm of 7 specialized AI agents that run every 5 minutes to:

1. Discover live BTC/ETH binary prediction markets
2. Compute a **fair probability** using 6 quantifiable technical analysis signals
3. Detect **mispriced markets** where implied probability deviates significantly from fair value
4. Size and execute **IOC limit orders** via `@somnia-chain/markets-sdk`
5. Automatically **redeem winning positions** after market settlement

The key innovation is the **Probability Scorecard** — a fully transparent, per-signal breakdown of *why* a market is mispriced, surfaced live in the dashboard for every trade.

---

## The Problem

DreamDEX Event Contracts are binary prediction markets where prices are probabilities. Most traders treat them as simple up/down bets. The real opportunity is **systematic edge detection**: when the market's implied probability diverges from a fair probability computed from multiple independent signals, there is an exploitable edge.

The challenge: doing this correctly requires deep SDK integration (all 13 documented gotchas), real-time TA data, sentiment analysis, order book microstructure analysis, risk management, and automatic settlement — orchestrated together without manual intervention.

Pryzm solves this with a 7-agent AI swarm, each agent specialized for one part of the pipeline.

---

## How We Used DreamDEX Event Contracts

Pryzm is built exclusively for DreamDEX Event Contracts. Every feature serves the prediction market use case:

### Full SDK Lifecycle
`dreamdex.service.ts` wraps the entire `@somnia-chain/markets-sdk` (v0.28.1) surface and explicitly handles all 13 documented gotchas:

| Gotcha | How Pryzm handles it |
|--------|----------------------|
| Gate writes on `onchain.status === 1` | Re-checked before every order |
| SDK throws on revert (≥0.23.0) | Errors propagate naturally |
| Float price off tick grid (< 0.28.0) | Pinned to v0.28.1, uses `priceToPrecision` |
| Unfilled remainder rests silently | All taker orders use `timeInForce: "IOC"` |
| `expireTimestampNs` mandatory in ns | Set to `min(now+300s, expiry-30s)` in nanoseconds |
| `amountToPrecision` floors to 0 | Checks result ≠ 0 before sending |
| Underfunded bot loops on reverts | Balance checked; SDK throws on ERC20 error |
| Multiple venues in indexer | Filtered by `venueId` on every market list call |
| Markets lock near expiry | Skips any market with < 5 minutes remaining |
| `loadMarkets()` skips finalized | Settlement uses `listBinaryMarkets({ status: "Finalized" })` |
| Losing redemption pays 0 | Outcome checked before spending gas |
| Pools recycled between windows | All state keyed by `marketId`, never pool address |
| Question text parsing is fragile | Reads `asset` and `intervalSec` typed fields only |

### Order Types Used
- **IOC limit orders** for taker execution (no silent resting remainder)
- **Post-only resting quotes** for Liquidity Mode (two-sided market making)
- **Mint/Merge** for Liquidity Mode inventory management

### Settlement
The EC Settlement Agent runs every 5 minutes independently of the main trading cycle. It calls `listBinaryMarkets({ status: "Finalized" })`, checks balances on the ERC-6909 outcome token contract, and redeems only winning positions. Voided markets redeem both sides.

---

## The 7-Agent Swarm

### EC Market Scanner
Calls `listLiveBinaryMarkets`, gates each candidate on `onchain.status === 1`, and filters by venue ID and expiry headroom. Returns enriched market data including implied UP/DOWN probabilities from the live order book.

### EC Edge Calculator
The analytical core. For each market, fetches Binance Futures OHLCV data and computes 6 independent TA signals:

```
Signal 1: RSI (14)              — oversold/overbought pressure     ±4%
Signal 2: MACD                  — momentum direction/crossover     ±3%
Signal 3: EMA20 Trend + Slope   — trend regime                     ±3%
Signal 4: Bollinger Band %B     — mean reversion pressure          ±3%
Signal 5: Volume Momentum       — volume-confirmed directional move ±2%
Signal 6: Price Momentum        — 5-bar return                     ±2%
```

Starting from a base of 0.5, each signal contributes a calibrated adjustment. The result is a **fair probability** that represents what the UP price *should* be given the current market conditions.

### EC Sentiment Agent
Uses Tavily web search (with Grok) to find recent BTC/ETH news and sentiment. Returns a sentiment adjustment of ±0.05 added to the TA fair probability.

### EC Order Book Agent
Analyzes bid/ask volume imbalance: a 64% bid-side market gets a +0.03 adjustment toward UP. Accounts for real-time buying pressure that TA may not yet reflect.

### EC Risk Agent
Applies hard risk management rules before any order is sent:
- Rejects if edge < minimum threshold (default 10%)
- Rejects if < 5 minutes to expiry
- Rejects if max drawdown reached
- Rejects if duplicate open position on same market
- Applies Kelly criterion sizing capped at 25% fraction

### EC Executor Agent
Takes approved trades, calls `dreamDexService.placeTakerOrder()`, and saves the full position record (including the probability scorecard) to Supabase.

### EC Settlement Agent
Background process running every 5 minutes. Scans finalized markets, redeems winnings, and updates position P&L in the database.

---

## The Probability Scorecard — Core Innovation

Every position in Pryzm's dashboard has an "Explain This Trade" button that opens a modal showing exactly why the agent took the trade:

```
BTC-15M  Market implied: 52.0%  |  Pryzm estimate: 67.4%  |  Edge: +15.4%
─────────────────────────────────────────────────────────────────────────
Signal              Value                    Contribution
RSI                 34.2 (oversold)          +4.0%
MACD                Bullish cross            +3.0%
Trend (EMA20)       Above (slope +0.12)      +3.0%
Bollinger Band      Near Lower Band          +3.0%
Volume Momentum     1.42x recent vs prior    +2.0%
Price Momentum      +0.612% (last 5 bars)    +2.0%
Sentiment           ETF inflow news          +2.4%
Order Book          64% bids                 +1.4%
─────────────────────────────────────────────────────────────────────────
Action: BUY UP @ 0.52  |  Kelly size: $14.20
```

This is not a black box. Every basis point of edge is attributed to a specific, quantifiable signal.

---

## How We Used @iqai/adk

Every agent is built with the `@iqai/adk` AgentBuilder pattern:

```typescript
export const ECEdgeCalculatorAgent = AgentBuilder.create('ec_edge_calculator')
  .withModel(llm)                          // GPT-4o for analysis
  .withDescription('...')
  .withInstruction(dedent`...`)            // Domain-specific prompt
  .withTools(computeFairProbabilityTool)   // createTool wrapping Binance + TA
  .withOutputSchema(z.object({ ... }));    // Zod-validated structured output
```

Key ADK features used:
- `AgentBuilder` — all 7 agents built with the fluent API
- `createTool` — 8 custom tools for market data, TA, order placement, redemption
- `AiSdkLlm` — GPT-4o for analysis agents, Grok (`scannerLlm`) for the sentiment agent which needs live web search
- Zod output schemas — every agent returns validated typed JSON, preventing hallucinated outputs from reaching the executor

---

## Dashboard

4-tab live dashboard, no wallet connection required:

**Live Markets** — 4 market cards (BTC-15m, BTC-1h, ETH-15m, ETH-1h), each with:
- Live UP/DOWN probability bar (updates every 10 seconds)
- Real-time expiry countdown
- Edge badge when mispricing is detected
- "Explain This Trade" button → Probability Scorecard modal

**Open Positions** — live holdings with entry price, edge at entry, expiry

**Track Record** — on-chain P&L history from `listBinaryMarkets({ status: "Finalized" })`, win rate, total P&L

**Agent Terminal** — live SSE stream of every agent step:
```
[EC-Scanner]    ✅ Found 4 live markets — BTC-15m implied 52.1%
[EC-Edge]       🔍 BTC-15m fair: 67.4% vs 52.1% — edge +15.4% ✅ TRADEABLE
[EC-Sentiment]  📡 BTC bullish: ETF inflow news +2.4%
[EC-OrderBook]  📊 BTC-15m 64% bids → +1.4%
[EC-Risk]       ⚖️ Kelly 8.2% of $172 = $14.20 — approved
[EC-Executor]   ⚡ BUY UP BTC-15m @ 0.538 — tx: 0x1a2b...
[EC-Settlement] 💰 Redeemed BTC-15m UP — +$6.40 — tx: 0x3c4d...
```

---

## Ecosystem Impact

- **Trading volume**: Every 5-minute agent cycle places real IOC orders on DreamDEX. More agent cycles = more volume.
- **Liquidity**: Liquidity Mode posts two-sided resting quotes (mint complete set → sell both sides), improving market depth for all participants without requiring a counterparty.
- **Transparency**: The Probability Scorecard makes prediction market pricing legible for non-technical users — they can see *why* a market is priced the way it is.
- **On-chain verifiability**: The Track Record tab pulls settlement data directly from the chain. Every P&L figure is verifiable against a transaction hash.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Somnia Testnet (chainId 50312) |
| Exchange | DreamDEX Event Contracts |
| SDK | `@somnia-chain/markets-sdk` v0.28.1 |
| Agent Framework | `@iqai/adk` — AgentBuilder, createTool, AiSdkLlm |
| LLMs | GPT-4o (analysis), Grok (sentiment/web search) |
| TA Data | Binance Futures OHLCV — BTC/ETH 15m and 1h |
| Sentiment | Tavily news search |
| Database | Supabase (PostgreSQL) |
| Backend | Node.js, TypeScript, Express |
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion |
| Risk | Kelly criterion + hard drawdown cap |

---

## Setup

```bash
# Backend
cd backend && npm install
# Add SOMNIA_PRIVATE_KEY, OPENAI_API_KEY, TAVILY_API_KEY, SUPABASE_URL to .env
npm run dev

# Frontend
cd frontend && npm install
# Set VITE_API_URL=http://localhost:3000/api in .env
npm run dev
```

Dashboard: `http://localhost:5173/app/event-contracts`

Get testnet STT tokens from the [Somnia Telegram](https://t.me/+XHq0F0JXMyhmMzM0).

---

## Summary

Pryzm is a production-quality autonomous trading system built specifically for DreamDEX Event Contracts:

✅ Full `@somnia-chain/markets-sdk` lifecycle — discover, trade, redeem  
✅ All 13 documented SDK gotchas handled explicitly  
✅ 7 specialized AI agents orchestrated every 5 minutes  
✅ Probability Scorecard with 8 quantified signals per trade  
✅ Kelly criterion risk sizing with hard drawdown protection  
✅ Automatic settlement and redemption — no manual claiming  
✅ Live dashboard with SSE agent terminal, no wallet required  
✅ On-chain verifiable Track Record from finalized markets  
✅ Liquidity Mode for two-sided market making via mint/merge  
✅ Clean TypeScript codebase, zero backend compilation errors  
