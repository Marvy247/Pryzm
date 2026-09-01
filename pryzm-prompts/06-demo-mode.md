# PRYZM — Prompt 06: Demo Mode, Gating Fix & Branding
## Remove barriers for judges, rename to Pryzm

**Prerequisite:** All previous prompts must be complete.

---

## Step 1: Remove RGE token gating from EventContractsPage

The `EventContractsPage` must be fully accessible without a wallet or RGE tokens. Judges will not have RGE. Do NOT gate the Event Contracts page behind `GatedContent`.

In `frontend/src/pages/EventContractsPage.tsx`, ensure there is **no** `<GatedContent>` wrapper around any part of the page. The entire page renders for all visitors. This is already the case if you followed `05-frontend.md` exactly — verify it now.

---

## Step 2: Update `GatedContent.tsx` — add demo bypass

**File:** `frontend/src/components/GatedContent.tsx`

Find the component and add a `bypassForDemo` prop. When true, always render children:

```tsx
// Add to GatedContent props interface:
bypassForDemo?: boolean;

// At the top of the component render logic, add:
if (bypassForDemo) return <>{children}</>;
```

Then on `EventContractsPage`, pass `bypassForDemo` if you ever use `GatedContent` there.

---

## Step 3: Branding — rename "Rogue" → "Pryzm" in UI strings only

**DO NOT rename files, directories, or database tables.** Only change user-visible strings.

### Files to update and what to change:

**`frontend/src/components/layout/DashboardLayout.tsx`**
- Find the app name / logo text and change `"ROGUE"` or `"Rogue"` to `"Pryzm"`
- Update the page `<title>` if present

**`frontend/src/pages/Home.tsx`**
- Change the hero headline from `"ROGUE"` / `"Rogue Agent"` to `"Pryzm"`
- Update tagline to: `"Autonomous AI Oracle for DreamDEX Event Contracts"`
- Keep all other content (signals, intel, yield sections) — just update the name

**`frontend/index.html`**
- Change `<title>` to `"Pryzm | DreamDEX Event Contracts AI"`

**`frontend/src/components/ChainOfThoughtModal.tsx`**
- Change `"ROGUE_AGENT // SYSTEM_CORE"` to `"PRYZM // EC_AGENT_CORE"`

**`backend/src/index.ts`** (logger messages only, not function names)
- Change any `logger.info('Rogue...')` startup messages to `logger.info('Pryzm...')`

**`README.md`** (root)
- Add a new section at the very top:
```markdown
# Pryzm — Autonomous AI Oracle for DreamDEX Event Contracts

> **Hackathon submission for Somnia × DreamDEX Event Contracts Hackathon**
> Built on top of [RogueAgent](https://github.com/zaikaman/RogueAgent) multi-agent framework.
```

---

## Step 4: Update README with Pryzm/DreamDEX content

Add this section to `README.md` right after the new header above:

```markdown
## 🎯 DreamDEX Event Contracts Integration

Pryzm is an autonomous AI agent that trades **DreamDEX Event Contracts** on the Somnia testnet.

### What it does
1. **Discovers** live BTC and ETH binary prediction markets (15m and 1h windows)
2. **Computes fair probability** using 6-signal TA analysis (RSI, MACD, Trend, Bollinger, Volume, Momentum) + sentiment + order book pressure
3. **Detects mispriced markets** where implied probability deviates ≥10% from fair value
4. **Executes IOC taker orders** via `@somnia-chain/markets-sdk` with full gotcha handling
5. **Automatically redeems** winning positions after settlement every 5 minutes

### Agent Architecture
| Agent | Role |
|-------|------|
| EC Market Scanner | Discovers live markets, reads order books |
| EC Edge Calculator | Computes fair probability scorecard |
| EC Sentiment | BTC/ETH news sentiment via Tavily + Grok |
| EC Order Book | Bid/ask imbalance microstructure signal |
| EC Risk | Kelly criterion sizing, hard drawdown limits |
| EC Executor | Places IOC orders, saves positions to DB |
| EC Settlement | Auto-redeems finalized markets every 5m |

### Setup
```bash
# Add to backend/.env:
SOMNIA_PRIVATE_KEY=0x...
SOMNIA_WALLET_ADDRESS=0x...
SOMNIA_RPC_URL=https://dream-rpc.somnia.network

# Install SDK
cd backend && npm install @somnia-chain/markets-sdk@0.28.1

# Run
npm run dev
```

Navigate to `/app/event-contracts` to see the live dashboard.
```

---

## Step 5: Final end-to-end check

Run both services and verify:

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

Then verify this checklist manually:

- [ ] `http://localhost:5173/app/event-contracts` loads without wallet connection
- [ ] Page title shows "Pryzm" not "Rogue"
- [ ] Nav sidebar shows "Event Contracts" item
- [ ] Live Markets tab shows market cards (or "No live markets" message)
- [ ] Run Agent button triggers a POST to `/api/ec/run` (check Network tab)
- [ ] Terminal tab shows SSE log stream connecting
- [ ] Track Record tab loads (may be empty, that is fine)
- [ ] TypeScript compiles: `cd backend && npx tsc --noEmit` — zero errors
- [ ] TypeScript compiles: `cd frontend && npx tsc --noEmit` — zero errors

---

## Step 6: Liquidity Mode (bonus — implement if time allows)

This is the highest-innovation feature. Add a toggle in `EventContractsPage` for "Liquidity Mode" that calls mint/merge and posts two-sided resting quotes.

Add to `ec-orchestrator.service.ts` a new method `runLiquidityMode()`:

```typescript
async runLiquidityMode(): Promise<void> {
  const markets = await dreamDexService.getLiveMarkets();
  for (const m of markets) {
    const book = await dreamDexService.getOrderBook(m, 3);
    const mid = book.midpoint;
    if (!mid) continue;
    const spread = 0.02; // 2% spread around midpoint
    // Mint a small complete set first to get inventory
    try {
      await dreamDexService.mintSet(m, 2);
      // Post resting buy UP at mid - spread/2
      await dreamDexService.placeRestingQuote(m, 'UP', 1, mid - spread / 2);
      // Post resting buy DOWN at (1 - mid) - spread/2
      await dreamDexService.placeRestingQuote(m, 'DOWN', 1, 1 - mid - spread / 2);
      this.log(`📊 Liquidity quotes posted on ${m.label}`, 'info');
    } catch (e) {
      this.log(`Liquidity mode failed on ${m.label}: ${e}`, 'warning');
    }
  }
}
```

Add a `POST /api/ec/liquidity` endpoint in `event-contracts.controller.ts`:
```typescript
router.post('/liquidity', async (_req, res) => {
  ecOrchestrator.runLiquidityMode().catch(err => logger.error('Liquidity mode failed:', err));
  res.json({ message: 'Liquidity mode started' });
});
```

Add a "Liquidity Mode" button next to "Run Agent" in `EventContractsPage.tsx`.
