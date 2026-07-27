# InvestWithAI — Portfolio Dashboard & Stock Screener

Multi-agent allocation dashboard with a staged-deployment plan for an **ETF** book and a **Stocks** book, an event-keyed **FOMC** playbook, plus a dual-book (Ross + Large-Cap) 5-Pillars **Screener** for research. Live Yahoo Finance data, no API keys.

> **Educational / demo project — not investment advice.** Capital, tickers, and allocations in `config/*.ts` are examples; edit for your own use. No warranty.

## Routes

| Route       | What it is                                                                              |
|-------------|-----------------------------------------------------------------------------------------|
| `/`         | ETF dashboard — broad-market core, staged deployment                                    |
| `/stocks`   | Single-stock dashboard — tier-aware sizing, Elliott Wave overlay                        |
| `/fomc`     | FOMC June-17 playbook — CUT/HOLD/HIKE scenarios, 4-phase event-keyed deployment, $700K, intraday charts, watchlist, broker CSV import |
| `/screener` | **5-Pillars Screener** — toggle between the **Ross** (small-cap momentum) and **Large-Cap** (S&P 500 / mega-cap) books over live movers (adjustable thresholds) |
| `/help`     | Full reference for every dashboard section                                              |

## Pipeline (ETF + Stocks)

Both books share a 5-agent pipeline parameterized by config:

1. **PortfolioStateAgent** — drift vs. target weights
2. **AllocationStrategyAgent** — `effectiveWeight = max(0, drift%) × regimeMultiplier`
3. **SignalAnalysisAgent** — RSI-14 + MACD(12,26,9) → BUY / HOLD / AVOID
4. **CapitalDeploymentAgent** — sizes next tranche from cash, regime-scaled, capped at phase budget
5. **ExecutionDecisionAgent** — share-level BUY tickets

Plus a 4-mode SPY regime detector (Rally / Neutral / Pullback / Correction) that scales every recommendation, and broker deep links for Fidelity / Robinhood / Schwab.

## Staged deployment

5 phases gated by either time elapsed or SPY drawdown from the P1 anchor (`lib/phaseGate.ts`). Each phase shows live status — *ready / locked / filled / executed*. Hard caps with override at the execution log.

## Elliott Wave overlay (Stocks only)

`lib/elliott-wave/counter.ts` — self-contained ZigZag pivot detector + 5-wave impulse fitter that enforces the three EW rules (W2 ≤ W1, W3 not shortest, W4 no overlap with W1), Fibonacci scoring, and a post-impulse phase classifier. Each ticker gets a phase label (W1–W5 / A / B / C), an invalidation price, and a STRONG BUY / BUY / HOLD / CAUTION / AVOID signal. Manual overrides in `config/elliott-wave.json`. **Display only** — does not feed position sizing.

## 5-Pillars Screener (`/screener`)

The screener runs a shared **5 Pillars** engine (`config/screenerProfile.ts` → `runScreener`) that can be pointed at two books via the on-page **BookTabs** toggle:

- **Ross** — Ross Cameron's (Warrior Trading) small-cap momentum filter (default).
- **Large-Cap** — an S&P 500 / mega-cap re-tuning of the same pillars, where the thresholds that are impossible for large caps (5× RVol / +10% day / $1–$20 price / <10M float) are relaxed and **Pillar 5 flips from "low float" to "market cap ≥ $10B"** (`config/largecap.ts`, served by `app/api/largecap/route.ts`).

Candidates are pulled from the **TradingView** public scanner (filtered server-side by the pillars), with a **Yahoo Finance** fallback (`small_cap_gainers` / `day_gainers` / `aggressive_small_caps`). A row shows a **green background** when all *automated* pillars pass.

### The 5 Pillars (Ross book)

| # | Pillar            | Default        | Notes                                                             |
|---|-------------------|----------------|-------------------------------------------------------------------|
| 1 | Relative Volume   | ≥ 5×           | TradingView 10-day RVol used as proxy                             |
| 2 | Daily % change    | ≥ +10%         | Already in motion                                                 |
| 3 | News catalyst     | manual (🔥 ≥15%)| Green catalyst headlines since previous close; verify yourself    |
| 4 | Price range       | $1–$20         | **Adjustable** — $20 / $50 / $100 / custom                        |
| 5 | Float             | < 10M shares   | N/A is flagged for manual check, **not** failed (matches script)  |

### Adjustable thresholds
All thresholds are user-adjustable at runtime via the in-page control and URL query params — e.g. `?maxPrice=100&minRvol=5&minChange=10&maxFloat=10000000`. `config/ross.ts` holds the Ross defaults + `resolveThresholds()` (clamps overrides to safe ranges); the price band, RVol, change % and float are applied server-side in the scanner.

### Freshness & refresh
Momentum names qualify and fade in seconds, so the universe is kept live: the table **auto re-scans every 60s** and shows a *"universe scanned Xs ago"* stamp. The server keeps only a short **45-second** result cache (keyed by the exact threshold set) purely to shield the unofficial TradingView scanner from duplicate/concurrent loads. The **Refresh** button forces a genuinely live scan by **bypassing that cache** (`?fresh=1` on `/api/ross` · `/api/largecap`), so you can always pull the current movers on demand. Live prices poll independently on a 30s / 1m / 5m selector.

### Extended hours (gap-and-go)
Ross's "gap and go" wants names already bidding **up** after the close and continuing into the pre-market. `lib/ross/extendedHours.ts` reads Yahoo's keyless `quote` endpoint for `marketState` (PRE / REGULAR / POST / …) plus pre- and post-market change %, flags candidates that are *rising* in extended hours, and normalizes the exchange prefix. Best-effort — never throws.

### News & sentiment
Latest headlines per pick published **since the previous market close** (after-hours + pre-market catalyst window). Source is **Yahoo Finance** search by default, or **Finnhub** company-news (`lib/ross/finnhub.ts`) for near-real-time, minute-level breaking headlines when `FINNHUB_API_KEY` is set — otherwise the Finnhub path is a transparent no-op. Headlines pass through a keyword **sentiment** scorer (`lib/ross/sentiment.ts`) that up-weights bullish momentum language and drops negative/neutral ones, so only green catalysts are surfaced. Google Finance deep-links per row for manual research.

### Code
`config/ross.ts` · `config/largecap.ts` · `config/screenerProfile.ts` (shared profile abstraction) · `lib/ross/{tradingview,yahooFallback,extendedHours,pillars,sentiment,news,finnhub,index}.ts` · `app/api/ross/route.ts` + `app/api/largecap/route.ts` (legacy `/api/screener` is a shim) · `components/ross/{RossTable,PillarBreakdown,RossControls,LargecapControls,BookTabs}.tsx`.

> Educational/demo only — day trading is extremely high risk and most day traders lose money.

## FOMC playbook (`/fomc`)

An event-keyed `$700K` deployment book for the June-17 FOMC decision with **CUT / HOLD / HIKE / neutral** scenario weight columns (`config/fomc.ts` + `config/fomc-scenarios.ts`) and a 4-phase schedule gated off the announcement window in ET. Extras:

- **Intraday charts** (`components/IntradayChart.tsx`, `app/api/fomc/intraday`) — per-ticker session price action.
- **Watchlist** (`components/WatchlistPanel.tsx`, `config/fomc-watchlist.ts`) — scenario-tagged tickers to monitor.
- **Broker CSV import** (`lib/brokerImport.ts`, `app/api/fomc/import`) — normalizes **Fidelity / Schwab / Robinhood** (and a generic) export into the execution log, reporting imported vs. skipped rows.
- **Data-health banner** (`components/DataHealthBanner.tsx`) surfaces stale/failed quote fetches.

All time gates and labels run through `lib/marketTime.ts` (US-ET, DST-aware) so a UTC midnight never gets compared against a 2pm-ET announcement.


## Run

```bash
npm install
npm run dev          # http://localhost:3000
```

No env vars required. Optional: `CAPITAL`, `CASH_BUFFER`, `SCREENER_MODE`, `SCREENER_DISCOVERY`, and `FINNHUB_API_KEY` (Ross Screener near-real-time catalyst news — free key at [finnhub.io](https://finnhub.io/register); falls back to Yahoo when unset). First load fetches ~9 months of daily candles per ticker + SPY; subsequent loads hit a 5-min cache.

## Tech

Next.js 14 (App Router) · TypeScript · TailwindCSS · `yahoo-finance2` · `recharts` · file-based execution log in `data/` (gitignored) · pure-TS Elliott Wave counter and screener (no external services).

## Project structure

```
app/                      # routes + API handlers (quotes, history, pipeline, executions, screener)
components/               # UI: TickerMarquee, RegimeBanner, AllocationTable, ScreenerTable, …
lib/
  yahoo.ts, indicators.ts, regime.ts, phaseGate.ts, store.ts
  marketTime.ts            # US-ET (DST-aware) gate helpers for the FOMC playbook
  brokerImport.ts          # Fidelity/Schwab/Robinhood CSV → execution log
  agents/                 # 5-agent pipeline (portfolioState → executionDecision)
  elliott-wave/           # ZigZag + impulse fitter + phase classifier
  ross/                   # 5 Pillars engine: tradingview, yahooFallback, pillars, news, index
config/
  portfolio.ts            # ETF book: capital, buffer, targets, tranches
  stocks.ts               # Stocks book: capital, tier-aware caps
  ross.ts                 # Ross Screener thresholds + resolveThresholds()
  largecap.ts             # Large-Cap screener thresholds (market-cap floor)
  screenerProfile.ts      # shared profile abstraction (ross | largecap)
  fomc.ts, fomc-scenarios.ts, fomc-watchlist.ts   # FOMC playbook + watchlist
  elliott-wave.json       # manual EW overrides
data/                     # execution logs (gitignored)
```

## Customizing

Everything is config-driven. Edit:
- `config/portfolio.ts` — ETF targets (weights sum to 1.0), tranche plan
- `config/stocks.ts` — stock universe with `tier: core | growth | speculative` (drives caps + ZigZag thresholds)
- `config/fomc.ts` + `config/fomc-scenarios.ts` — FOMC playbook universe, per-scenario weight columns (CUT/HOLD/HIKE/neutral), event-keyed phase schedule
- `config/ross.ts` — Ross Screener 5-Pillar thresholds (min RVol, min change %, price band, max float) + safe-clamp ranges
- `config/largecap.ts` + `config/screenerProfile.ts` — Large-Cap screener thresholds (market-cap floor) and the shared profile abstraction
- `config/elliott-wave.json` — manual wave-count overrides (set `phase` ≠ `"UNKNOWN"` to skip auto-counter)
- `lib/agents/signalAnalysis.ts` — RSI/MACD thresholds
- `lib/regime.ts` — regime sensitivity + multipliers
- `lib/ross/index.ts` + `config/ross.ts` — Ross Screener candidate sourcing, pillar thresholds, news window

Capital and cash buffer also have an in-dashboard "Edit sizing" control (persists per browser, supports `?capital=…&buffer=…` URL override).

## Disclaimer

Educational use only. Not investment advice. Investing involves risk including possible loss of principal. No broker API integration — all orders are placed manually.
