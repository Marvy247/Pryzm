# Pryzm — Autonomous AI Oracle for DreamDEX Event Contracts

> **Hackathon submission — Somnia × DreamDEX Event Contracts Hackathon**

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Somnia](https://img.shields.io/badge/Network-Somnia_Testnet-8B5CF6?style=for-the-badge)](https://somnia.network/)
[![DreamDEX](https://img.shields.io/badge/Exchange-DreamDEX-00D4FF?style=for-the-badge)](https://dreamdex.io/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

**Autonomous 7-agent AI swarm that discovers, analyzes, trades, and redeems DreamDEX Event Contracts on Somnia testnet — fully end-to-end.**

</div>

---

## What is Pryzm?

Pryzm is a purpose-built autonomous trading agent for **DreamDEX Event Contracts** — binary Up/Down prediction markets on BTC and ETH with 15-minute and 1-hour windows on the Somnia network.

The core insight: prediction market prices are probabilities. When the market's implied probability diverges from a fair probability computed from technical analysis, sentiment, and order book microstructure, there is **edge**. Pryzm finds that edge autonomously, sizes positions using Kelly criterion, executes IOC orders via the `@somnia-chain/markets-sdk`, monitors positions, and automatically redeems winning positions after settlement.

No manual intervention. Full lifecycle. On-chain verifiable.

---

## How It Works

```
Every 5 minutes:

1. EC Market Scanner    — discovers live BTC/ETH markets, reads order books
2. EC Edge Calculator   — computes fair probability from 6 TA signals (RSI, MACD,
                          EMA Trend, Bollinger Bands, Volume Momentum, Price Momentum)
3. EC Sentiment Agent   — fetches BTC/ETH news via Tavily, adjusts probability ±5%
4. EC Order Book Agent  — analyzes bid/ask imbalance, adjusts probability ±3%
                          ↓ COMBINE: final fair prob = TA + sentiment + book pressure
5. EC Risk Agent        — Kelly criterion sizing, hard drawdown cap, duplicate guard
6. EC Executor Agent    — places IOC limit orders via @somnia-chain/markets-sdk
7. EC Settlement Agent  — scans finalized markets, redeems winnings every 5 min
```

---

## The Probability Scorecard

The core innovation. For every trade, Pryzm produces a fully transparent breakdown of *why* a market is mispriced:

```
BTC-15M  Market implied: 52.0%  |  Pryzm estimate: 67.4%  |  Edge: +15.4%
─────────────────────────────────────────────────────────────────
Signal              Value                    Contribution
RSI                 34.2 (oversold)          +4.0%
MACD                Bullish cross            +3.0%
Trend (EMA20)       Above (slope +0.12)      +3.0%
Bollinger Band      Near Lower Band          +3.0%
Volume Momentum     1.42x recent vs prior    +2.0%
Price Momentum      +0.612% (last 5 bars)    +2.0%
Sentiment           ETF inflow news          +2.4%
Order Book          64% bids                 +1.4%  (imbalance)
─────────────────────────────────────────────────────────────────
Action: BUY UP @ 0.52  |  Kelly size: $14.20
```

This is surfaced live in the dashboard via the "Explain This Trade" modal on every position.

---

## Architecture

```
backend/
├── src/
│   ├── agents/
│   │   ├── ec-market-scanner.agent.ts    # Discovers live markets, reads order books
│   │   ├── ec-edge-calculator.agent.ts   # Fair probability + 6-signal scorecard
│   │   ├── ec-sentiment.agent.ts         # News sentiment via Tavily + Grok
│   │   ├── ec-orderbook.agent.ts         # Bid/ask imbalance microstructure
│   │   ├── ec-risk.agent.ts              # Kelly criterion, drawdown guard
│   │   ├── ec-executor.agent.ts          # Places IOC orders, saves to DB
│   │   └── ec-settlement.agent.ts        # Auto-redeems finalized markets
│   ├── services/
│   │   ├── dreamdex.service.ts           # Full SDK wrapper — all 13 gotchas handled
│   │   ├── ec-orchestrator.service.ts    # Master lifecycle loop + SSE log stream
│   │   ├── binance.service.ts            # OHLCV data for TA (BTC/ETH 15m/1h)
│   │   ├── tavily.service.ts             # News/sentiment search
│   │   └── supabase.service.ts           # Positions, run history
│   ├── api/
│   │   └── event-contracts.controller.ts # REST + SSE endpoints
│   └── config/
│       └── somnia.config.ts              # Chain config, market constants
└── frontend/
    └── src/
        ├── pages/EventContractsPage.tsx        # Main dashboard (4 tabs)
        └── components/
            ├── MarketCard.tsx                  # Live probability bar + countdown
            ├── ProbabilityScorecard.tsx        # "Explain this trade" modal
            └── TrackRecord.tsx                 # On-chain P&L history
```

---

## Agent Detail

| Agent | Model | Key Tool | Output |
|-------|-------|----------|--------|
| EC Market Scanner | GPT-4o | `list_live_ec_markets` | 4 live markets with order book data |
| EC Edge Calculator | GPT-4o | `compute_fair_probability` | Fair prob + 6-signal scorecard per market |
| EC Sentiment | Grok (web search) | `search_tavily` | Sentiment score + adjustment ±5% |
| EC Order Book | GPT-4o | `analyze_order_book` | Bid/ask imbalance + adjustment ±3% |
| EC Risk | GPT-4o | `check_risk_parameters` | Approved size (Kelly) or rejection + reason |
| EC Executor | GPT-4o | `execute_ec_trade` | IOC order + position saved to DB |
| EC Settlement | GPT-4o | `redeem_settled_markets` | Redemption tx hashes + PnL updated |

---

## SDK Integration — All 13 Gotchas Handled

`dreamdex.service.ts` implements the full `@somnia-chain/markets-sdk` (v0.28.1) surface with explicit handling of every documented gotcha:

| # | Gotcha | How Pryzm handles it |
|---|--------|----------------------|
| 1 | Gate writes on `onchain.status === 1` | Re-checks before every `placeTakerOrder` call |
| 2 | SDK ≥0.23.0 throws on revert | Error propagates naturally; no silent status flag checks |
| 3 | Float price fails below 0.28.0 | Pinned to `0.28.1`; uses `priceToPrecision` |
| 4 | Unfilled remainder rests silently | All taker orders use `timeInForce: "IOC"` |
| 5 | `expireTimestampNs` mandatory in ns | Set to `min(now+300s, marketExpiry-30s)` in nanoseconds |
| 6 | `amountToPrecision` floors to 0 | Checks result ≠ 0 before sending; throws if below lot |
| 7 | Underfunded bot sends reverts | Balance logged before signing; SDK throws on ERC20 error |
| 8 | Multiple venues in one indexer | Filters by `venueId` on every `listLiveBinaryMarkets` call |
| 9 | Markets locking near expiry | Skips any market with < 5 minutes remaining |
| 10 | `loadMarkets()` skips finalized | Settlement uses `listBinaryMarkets({ status: "Finalized" })` |
| 11 | Losing redemption pays 0 | Checks outcome before spending gas; skips zero-balance sides |
| 12 | Pools recycled between windows | All state keyed by `marketId`, never `poolAddress` |
| 13 | Question text parsing is fragile | Reads `asset` and `intervalSec` typed fields only |

---

## Dashboard

The frontend provides a focused 4-tab dashboard for the Event Contracts agent:

**Live Markets** — 4 market cards (BTC-15m, BTC-1h, ETH-15m, ETH-1h) with:
- Live UP/DOWN probability bar updating every 10 seconds
- Real-time expiry countdown
- Edge badge when Pryzm detects a mispriced market
- "Explain This Trade" button opening the Probability Scorecard modal

**Open Positions** — current holdings with entry price, edge at entry, expiry time

**Track Record** — on-chain verified P&L history pulled from `listBinaryMarkets({ status: "Finalized" })`, showing win rate and total P&L

**Agent Terminal** — live SSE log stream of each agent step as the cycle runs:
```
[EC-Scanner]   ✅ Found 4 live markets — BTC-15m implied 52.1%, ETH-1h implied 48.3%
[EC-Edge]      🔍 BTC-15m fair: 67.4% vs implied 52.1% — edge +15.4% ✅ TRADEABLE
[EC-Sentiment] 📡 BTC bullish: ETF inflow news +2.4%
[EC-OrderBook] 📊 BTC-15m 64% bids → +1.4%
[EC-Risk]      ⚖️ Kelly 8.2% of $172 = $14.20 — approved
[EC-Executor]  ⚡ BUY UP BTC-15m @ 0.538 — filled $14.20 — tx: 0x1a2b...
[EC-Settlement]💰 Redeemed BTC-15m UP — +$6.40 — tx: 0x3c4d...
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Somnia Testnet (chainId: 50312) |
| **Exchange** | DreamDEX Event Contracts |
| **SDK** | `@somnia-chain/markets-sdk` v0.28.1 |
| **Agent Framework** | `@iqai/adk` (AgentBuilder, createTool, AiSdkLlm) |
| **LLMs** | GPT-4o (analysis), Grok (web/sentiment search) |
| **TA Data** | Binance Futures OHLCV (BTC/ETH, 15m and 1h) |
| **Sentiment** | Tavily news search |
| **Database** | Supabase (PostgreSQL) — positions, runs, history |
| **Backend** | Node.js, TypeScript, Express |
| **Frontend** | React 18, Vite, Tailwind CSS, Framer Motion |
| **Risk Model** | Kelly criterion with hard drawdown cap |

---

## Setup

### Prerequisites
- Node.js v18+
- Supabase project
- Somnia testnet wallet with STT tokens (get from [Somnia Telegram](https://t.me/+XHq0F0JXMyhmMzM0))
- OpenAI API key
- Tavily API key (for sentiment)

### Backend

```bash
cd backend
npm install
cp .env.example .env
```

Required `.env` values:
```env
# Somnia Testnet — required for trading
SOMNIA_PRIVATE_KEY=0x...
SOMNIA_WALLET_ADDRESS=0x...
SOMNIA_RPC_URL=https://dream-rpc.somnia.network
SOMNIA_WS_RPC_URL=wss://dream-rpc.somnia.network/ws
SOMNIA_INDEXER_URL=https://indexer.dreamdex.io
SOMNIA_VENUE_ID=1

# AI
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...

# Database
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Agent settings (defaults shown)
EC_MIN_EDGE_PERCENT=10
EC_MAX_POSITION_SIZE_USD=20
EC_MAX_DRAWDOWN_PERCENT=30
EC_MIN_EXPIRY_HEADROOM_SECONDS=300
EC_RUN_INTERVAL_MINUTES=5
```

Run the DB migration:
```sql
-- Run ec_tables.sql in your Supabase SQL editor
-- Creates: ec_positions, ec_runs, ec_agent_config
```

```bash
npm run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE_API_URL=http://localhost:3000/api
npm run dev
```

Navigate to `http://localhost:5173/app/event-contracts`.

No wallet connection required to view the dashboard.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ec/markets` | Live markets with implied probabilities |
| POST | `/api/ec/run` | Trigger a manual agent cycle |
| GET | `/api/ec/status` | Orchestrator running state |
| GET | `/api/ec/logs/stream` | SSE — live agent log stream |
| GET | `/api/ec/positions` | Open positions |
| GET | `/api/ec/history` | Closed positions with P&L stats |
| GET | `/api/ec/track-record` | Finalized markets from chain |
| GET | `/api/ec/wallet-balance` | Current USDso balance |
| GET | `/api/ec/runs` | Recent orchestrator run history |
| POST | `/api/ec/liquidity` | Trigger Liquidity Mode (two-sided quoting) |

---

## How Pryzm Drives DreamDEX Adoption

Every agent cycle places real orders on DreamDEX, generating trading volume directly. Beyond the agent itself:

- **Transparent edge detection** makes prediction markets more approachable — users can see *why* a market is mispriced, not just act on a black-box signal
- **Liquidity Mode** (two-sided quoting via mint/merge) provides sell-side inventory without needing a counterparty, making markets more liquid for all participants
- **Track Record tab** shows on-chain verifiable performance, building trust in algorithmic Event Contract trading

---

## License

MIT — see [LICENSE](LICENSE)
