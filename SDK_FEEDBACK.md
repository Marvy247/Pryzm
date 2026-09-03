# SDK & Documentation Feedback — `@somnia-chain/markets-sdk` + docs.dreamdex.io

**From:** Pryzm (Event Contracts Hackathon, Somnia x DreamDEX)
**Written:** 2026-09-03, against `@somnia-chain/markets-sdk@0.28.1`
**Testnet:** Somnia Testnet (chainId 50312)

---

## Summary

Pryzm is a 7-agent autonomous trading system for DreamDEX Event Contracts. We built the entire pipeline — market discovery, TA-based edge detection, order book analysis, risk management, order execution, and settlement — using the SDK as our sole on-chain interface. During development we hit several issues ranging from a dead critical infrastructure dependency to missing constructor config that blocked trade execution for hours.

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 2 |
| Medium | 3 |
| Low | 2 |

---

## Findings

| # | Type | Finding | Severity |
|---|------|---------|----------|
| 1 | Bug | Indexer (`indexer.dreamdex.io`) is down (NXDOMAIN) — `loadMarkets()`, `listBinaryMarkets()`, and all GraphQL-dependent methods fail | Critical |
| 2 | Gap | `SomniaMarkets` constructor requires `addresses.binaryModule` but this is undocumented — throws `NotConfiguredError` at runtime | High |
| 3 | Gap | `getMarketOnchain()` requires both `addresses.binaryModule` AND `addresses.binarySettlement` — neither is mentioned in the constructor docs | High |
| 4 | Trap | `createOrder()` depends on `loadMarkets()` which depends on the dead indexer — there is no fallback to read market metadata from chain | Medium |
| 5 | Gap | `SOMNIA_TESTNET_ADDRESSES` constant exists in the package but is not mentioned in the README or any docs page | Medium |
| 6 | Gap | Binary pool read ABI (`getBookLevels`, `getBinaryPoolParams`, `getAllOpenOrdersOffChain`) is not exported — we had to hand-transcribe the ABI from the contract | Medium |
| 7 | Nit | The `SDK_FEEDBACK.md` format specified in the hackathon listing has no template — other teams used varying formats | Low |
| 8 | Nit | Version floor (`>=0.25.0`) is stated in docs but `>=0.23.0` in the README | Low |

---

## 1. Indexer is dead — blocks all SDK write operations (Critical)

**Where:** `loadMarkets()` → `listRegistryMarkets()` → GraphQL to `indexer.dreamdex.io`

**What happened:** During development (and as of 2026-09-03), `indexer.dreamdex.io` returns NXDOMAIN. Every SDK method that depends on `loadMarkets()` fails:

- `createOrder()` — throws `InvalidInputError: unknown symbol ... call loadMarkets() first`
- `listBinaryMarkets()` — GraphQL request fails
- `listRegistryMarkets()` — same
- `getMarket()` — same

**Impact:** We could not place a single on-chain trade through the SDK. Our entire execution layer had to be either bypassed (simulated trades) or reimplemented with raw viem `readContract` calls.

**What we built as a workaround:** A binary-search scanner that reads market data directly from the `BinaryMarketsModule` contract using `binaryModuleReadAbi.markets()`, bypassing the indexer entirely. This works but required us to reverse-engineer the contract's return tuple layout from the SDK source.

**Recommendation:**
- Either restore the indexer or document a fallback path: "If the indexer is unavailable, read market metadata from the `BinaryMarketsModule.markets(bytes32)` function directly"
- The `loadMarkets()` method should have an optional `fromChain: true` mode that reads market registry from on-chain contracts instead of GraphQL

---

## 2. `addresses.binaryModule` is required but undocumented (High)

**Where:** `new SomniaMarkets({ ... })`

**What happened:** The SDK threw:
```
NotConfiguredError: @somnia-chain/markets-sdk: getMarketOnchain (v2 resolves markets by marketId through the module) — needs addresses.binaryModule
```

The constructor accepts an `addresses` property but neither the README nor any docs page mentions it. We found the fix by reading the SDK source (`createClient.js` line 496).

**Recommendation:** Add `addresses` to the constructor example in the README:
```typescript
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from '@somnia-chain/markets-sdk';
const sdk = new SomniaMarkets({
  chain: SOMNIA_TESTNET_CHAIN,
  privateKey: '0x...',
  addresses: SOMNIA_TESTNET_ADDRESSES, // required for on-chain reads
});
```

---

## 3. `getMarketOnchain()` requires both `binaryModule` AND `binarySettlement` (High)

**Where:** `client.getMarketOnchain(marketId)`

**What happened:** After fixing finding #2 (adding `binaryModule`), we still got:
```
NotConfiguredError: needs addresses.binarySettlement
```

The settlement address is used inside `getMarketOnchain()` at line 500 of `createClient.js`:
```javascript
return Markets.getMarketOnchain(marketId, {
  module: config.addresses?.binaryModule,
  settlement: config.addresses?.binarySettlement
}, getClient());
```

**Recommendation:** Document both addresses together. Or better: if `SOMNIA_TESTNET_ADDRESSES` is imported, use it automatically.

---

## 4. `createOrder()` has no indexer-free fallback (Medium)

**Where:** `exchange.createOrder(symbol, type, side, amount, price, params)`

**What happened:** `createOrder()` calls `this.market(ref)` which calls `this.registry.resolve(ref)` which requires loaded markets from the indexer. There is no code path that reads market metadata from chain when the indexer is unavailable.

**Impact:** Even though we could read order books, compute edge, and pass risk checks, we could not actually send the IOC order to the CLOB contract.

**Recommendation:** Either:
- Add a `createOrderFromChain(marketId, ...)` method that reads pool/token IDs from the `BinaryMarketsModule` contract directly
- Or document the raw `trader.placeOrder()` interface so integrators can bypass `createOrder()` when needed

---

## 5. `SOMNIA_TESTNET_ADDRESSES` exists but is undocumented (Medium)

**Where:** `node_modules/@somnia-chain/markets-sdk/dist/addresses.js`

**What happened:** The package exports `SOMNIA_TESTNET_ADDRESSES` and `SOMNIA_MAINNET_ADDRESSES` with all deployed contract addresses, but this export is not mentioned anywhere in the README or docs. We only found it by grepping the package source.

**Recommendation:** Add to the README:
```typescript
import { SOMNIA_TESTNET_ADDRESSES } from '@somnia-chain/markets-sdk';
// Includes: binaryModule, binarySettlement, collateral, oracleHub, etc.
```

---

## 6. Binary pool read ABI is not exported (Medium)

**Where:** Reading order books, pool parameters, open orders

**What happened:** We needed to call `getBookLevels` on the binary pool contract to read order book depth. The SDK ships `binaryPoolWriteAbi` but not `binaryPoolReadAbi`. We had to hand-transcribe the function selectors from the contract source.

**Recommendation:** Export `binaryPoolReadAbi` alongside the write ABI. This is especially important for building analytics tools and dashboards that need to read market state without write access.

---

## 7. No feedback report template (Low)

**Where:** Hackathon listing — "A feedback report regarding SDK and documentation"

**What happened:** The hackathon requires a feedback report but provides no template or format. Other teams submitted varying formats (markdown, PDF, numbered lists, prose). This made it unclear what level of detail is expected.

**Recommendation:** Provide a template or example (like this document) so teams know what to include.

---

## 8. Version floor inconsistency (Low)

**Where:** README says `>=0.23.0`, docs say `>=0.25.0`

**What happened:** The npm README states "use version 0.23.0 or newer" while the docs.dreamdex.io Getting Started page says "Use version 0.25.0 or newer."

**Recommendation:** Align on a single minimum version across all docs.

---

## What worked well

- **`getBookLevels`** — Once we read the pool contract directly, order book data was excellent and fast
- **`binaryModuleReadAbi.markets()`** — Clean, well-structured return tuple for reading market metadata on-chain
- **`SOMNIA_TESTNET_ADDRESSES`** — Having all addresses in one constant is great (just needs docs)
- **The gotchas page** — `developers/event-contracts/gotchas.md` was genuinely helpful during development
- **IOC order type** — The `timeInForce: "IOC"` path is well-designed for bot trading

---

## What we would fix first (priority order)

1. **Restore or replace the indexer** — This is blocking every team. A chain-based fallback in `loadMarkets()` would unblock all SDK write operations.
2. **Document `addresses` in the constructor** — One code block in the README prevents hours of debugging.
3. **Export `binaryPoolReadAbi`** — The read surface is essential for dashboards and analytics tools.
4. **Add a `createOrderFromChain()` or document raw `trader.placeOrder()`** — Integrators need a path when the indexer is down.
