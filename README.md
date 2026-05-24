# InvestWithAI — ETF & Stocks Portfolio Dashboard

A multi-agent allocation dashboard that operationalizes a staged-deployment investment plan across **two portfolios** — an **ETF** book (broad-market core) and a **Stocks** book (AI / semis / quantum themes). Live Yahoo Finance data, 5 cooperating agents per book, phased capital deployment with hard caps, full execution-loop tracking, broker deep links (Fidelity, Robinhood, Charles Schwab), and a research overlay that includes an automated **Elliott Wave Invalidation Watch**.

> **Educational / demo project — not investment advice.** The capital figures, tickers, and allocation in `config/portfolio.ts` are an **example only**; edit them for your own situation. ETFs involve risk including possible loss of principal. No warranty of any kind.

## Two dashboards

| Route        | Universe                                                                                  | Capital control                                 |
|--------------|-------------------------------------------------------------------------------------------|-------------------------------------------------|
| `/`          | ETFs — 11 funds, blended ~0.22% ER, broad market exposure                                  | Hero card "Edit sizing"                          |
| `/stocks`    | 19 single stocks — NVDA, TSM, AVGO, ASML, MU, VRT, RBRK, CRWV, AAOI, BE, IONQ, RGTI, QBTS, INDI, QNC, LAES, BTQ, ARQQ, ZENA | "Stocks Portfolio · Fidelity" capital editor (propagates to every card) |
| `/screener`  | 3-gate stock screener (~30 tickers) across themes (AI, semis, quantum, biotech, …). Two modes: **classic** (Minervini Stage-2 confirmation) and **gem** (early-upside discovery). | `?mode=classic\|gem`, `?discovery=on` |
| `/help`      | Every section explained — what it does, why it exists, how to read it, FAQs, reference tables, floating "back to top" button | —                                                |

Both dashboards share the same agent pipeline (`lib/agents/`) parameterized by portfolio config. The Stocks dashboard adds tier-aware sizing (**core / growth / speculative**), a dividend tracker, risk profile card (both collapsible), and the Elliott Wave Invalidation Watch.

## What it does

- Pulls **live quotes and 9-month price history** for every symbol in your universe (no API key required).
- Runs a **5-agent pipeline** on every page load:
  1. **PortfolioStateAgent** — drift vs. target weights from your executions log
  2. **AllocationStrategyAgent** — `effectiveWeight = max(0, drift%) × regimeMultiplier`, normalized
  3. **SignalAnalysisAgent** — RSI-14 + MACD(12,26,9) → BUY (≤35) / HOLD / AVOID (≥70)
  4. **CapitalDeploymentAgent** — sizes the next tranche from cash − buffer, regime-scaled, capped at remaining phase budget
  5. **ExecutionDecisionAgent** — turns the above into share-level BUY tickets
- Detects **4-mode market regime** (Rally / Neutral / Pullback / Correction) from SPY SMA cross.
- Enforces **staged deployment** with phase-level hard caps (overridable).
- Provides **broker deep links** — **Fidelity** (green), **Robinhood** (black), **Charles Schwab** (blue) — and copy-ready order strings.
- **Records your real executions** (per-portfolio) — drift, deployment progress, and recommendations all update in real time.
- **Elliott Wave Invalidation Watch** (Stocks only) — algorithmic ZigZag + Fibonacci wave counter labels each ticker's current phase (W1/W2/.../A/B/C), computes the price that would invalidate the count, and emits a STRONG BUY / BUY / HOLD / CAUTION / AVOID signal. Hand-maintained overrides in `config/elliott-wave.json` win over the auto-counter. **Display only** — does not influence position sizing today.

## Stocks portfolio (editable in `config/stocks.ts`)

19 tickers across three risk tiers. Capital and buffer are edited inline from the Stocks dashboard hero (persists per browser; URL override supported).

| Tier         | Tickers                                                       | Per-name cap        | Notes                                              |
|--------------|---------------------------------------------------------------|---------------------|----------------------------------------------------|
| Core         | NVDA, TSM, AVGO, ASML, MU                                     | Larger              | AI / semis backbone                                |
| Growth       | VRT, RBRK, CRWV, AAOI, BE                                     | Medium              | Power / data-center / security plays               |
| Speculative  | IONQ, RGTI, QBTS, INDI, QNC, LAES, BTQ, ARQQ, ZENA            | Smallest, tight     | Quantum / microcap — higher ZigZag pivot threshold |

The Stocks pipeline reuses the ETF agent stack (`portfolioState → allocationStrategy → signalAnalysis → capitalDeployment → executionDecision`) with tier-aware caps applied during deployment.

## Elliott Wave overlay (Stocks only)

`lib/elliott-wave/counter.ts` implements a self-contained wave counter:

1. **ZigZag pivot detector** with tier-aware thresholds (Core 7% / Growth 9% / Speculative 12%) — filters noise based on the symbol's expected volatility.
2. **5-wave bullish impulse fitter** that enforces the three cardinal EW rules: W2 ≤ 100% of W1, W3 is never the shortest motive wave, W4 cannot overlap W1.
3. **Fibonacci bell-curve scoring** — Gaussian fit to canonical ratios (W2 → 0.5, W3 → 1.618 × W1, W4 → 0.318 × W3, W5 → equal to W1).
4. **Post-impulse phase classifier** — once an impulse completes, current price vs. W5/W4/W2 levels determines whether we're in W5 extension, A wave, B bounce, or C decline.
5. **Sanity guard** — any count whose invalidation distance exceeds 60% of price is downgraded to UNKNOWN.

`config/elliott-wave.json` is the manual-override file (schema documented in-file). Any ticker left with `phase: "UNKNOWN"` is auto-counted on each pipeline run. The card renders phase + 1-line description + signal badge + invalidation price + distance. **Display only**; does not feed back into position sizing today (see `/help#invalidation-watch` for the full mapping table).

## Screener (`/screener`)

A 3-gate stock screener over a curated universe of ~30 tickers grouped by theme (AI infra, semis, quantum, biotech, energy, etc.). Each ticker is evaluated against three independent gates and assigned a 0–100 confidence score with `passedAll` flag.

### Two modes

| Mode      | Query param         | Use case                                            |
|-----------|---------------------|-----------------------------------------------------|
| Classic   | `?mode=classic` (default) | Minervini Stage-2 confirmation — leaders already in motion, low false-positive trend signal |
| Gem       | `?mode=gem`         | Early-upside discovery — finds names before consensus, accepts more noise for earlier entries |
| Discovery | `?mode=gem&discovery=on` | Expands universe by pulling top 10 holdings from ARKK / ARKG / SMH / XBI / KWEB / ICLN (capped at 25 net-new tickers) |

The gate `maxScores` are preserved at **40 / 25 / 20** in both modes; gem mode rebalances scoring *within* those budgets so confidence bands (75 / 55 / 35) stay directly comparable.

### Three gates

1. **Fundamentals (40 pts)** — revenue growth, gross / operating margins, FCF, debt/equity. Gem mode adds: **PEG ratio** (Lynch GARP), **EPS revision direction** (Bernard & Thomas PEAD), **5-point Piotroski proxy** from annual income / cashflow / balance sheet history.
2. **Moat (25 pts)** — chokepoint position (1–3), analyst consensus, institutional ownership. Gem mode adds: **neglect premium** for emerging names with ≤3 analysts (Arbel 1983), **insider cluster count** from `insiderTransactions` (conservative purchase-text allowlist, 90-day window) + `netSharePurchaseActivity` sanity check.
3. **Trend (20 pts)** — Mark Minervini trend template (8 conditions on price vs. SMAs and 52-week range). Gem mode also rewards: **relative strength vs. SPY** (Mansfield/O'Neil 252d ratio), **frog-in-pan stealth grind** (Da/Gurun/Warachka 2014), **volume thrust** (CANSLIM), **base length** (consolidation tightness). Names <18 months old (`ipoAgeDays`) are routed into an **early-IPO branch** with relaxed conditions.

### Regime modifier

The 4-mode SPY regime detector adjusts the final score:
- Classic: rally +3, neutral 0, pullback −3, correction hard-vetoes to watch-only
- Gem: rally +2, neutral 0, **pullback +3** (entry zone), correction only vetoes if Gate 1 or Gate 2 *also* fail

### UI

- Mode toggle (Classic / Gem) in the screener header
- 🔥 **Squeeze badge** for tickers with high short interest + days-to-cover (from `shortPercentOfFloat` + `shortRatio`, display only — not scored)
- `disc` badge for tickers added via the discovery feed
- Theme groupings with pass/fail counts and average confidence
- Per-row drill-down showing every gate's check, score, and reasoning

### Environment flags (optional)

- `SCREENER_MODE=gem` — set default mode
- `SCREENER_DISCOVERY=on` — enable discovery feed by default

## Portfolio (editable in `config/portfolio.ts`)

Total capital and the reserved cash buffer can be changed at runtime from the **Edit sizing** button in the dashboard hero card (persists per browser via `localStorage` and a `?capital=…&buffer=…` URL override). All derived cards — tranche sizes, deployment plan, sizing %s — recompute automatically. Defaults can also be set via `CAPITAL` / `CASH_BUFFER` env vars (see `.env.example`).

| Ticker | Weight | Expense | Role |
|--------|------:|--------:|------|
| FELC   | 18%   | 0.18%   | US large-cap core (Fidelity Enhanced) |
| QQQM   | 14%   | 0.15%   | AI / mega-cap tech (Nasdaq-100) |
| FENI   | 12%   | 0.28%   | International developed (enhanced) |
| SMH    | 10%   | 0.35%   | Semiconductors (AI infrastructure) |
| FDVV   | 10%   | 0.16%   | Quality dividend / defensive |
| FHLC   |  8%   | 0.084%  | Healthcare |
| FMDE   |  8%   | 0.23%   | Mid-cap growth |
| XAR    |  6%   | 0.35%   | Aerospace & defense |
| FENY   |  6%   | 0.084%  | Energy / inflation hedge |
| XBI    |  4%   | 0.35%   | Biotech upside kicker |
| FBND   |  4%   | 0.36%   | Bond ballast |

**Blended expense ratio: ~0.22%/yr (~$650/yr on $300K).** Total capital $300K, deployed across **5 phases** ($120K + $40K + $40K + $40K + $60K). The final $60K phase represents the cash buffer release — it only unlocks on trend confirmation (regime = rally) or after 90 days from the P1 anchor.

### Staged deployment plan

| Phase | Amount | Trigger                                              |
|------:|-------:|------------------------------------------------------|
| P1    | $120K  | Start immediately                                    |
| P2    | $40K   | SPY −5% from P1 peak  OR  30 days elapsed            |
| P3    | $40K   | SPY −8% from P1 peak  OR  60 days elapsed            |
| P4    | $40K   | SPY −12% correction from P1 peak (no time fallback)  |
| P5    | $60K   | Trend confirmation (regime = rally)  OR  90 days     |

Triggers are evaluated live by `lib/phaseGate.ts`: the P1 anchor is the date of your first logged execution (or today if none), and the SPY drawdown is measured from the **peak SPY close since the anchor**. Each phase shows its current status — **ready**, **locked**, **filled**, or **executed** — on the *Staged capital deployment* card.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
```

No environment variables required. First page load fetches ~9 months of daily candles per ETF + SPY for regime detection; subsequent loads hit a 5-minute in-memory cache.

## Dashboard sections

1. **📊 Today's buys ticker** — scrolling marquee (right→left, hover-to-pause) with the current Execution Agent output
2. **Hero summary** + theme toggle (light/dark, persists via localStorage)
3. **Market regime banner** — 4-mode detector with the SPY inputs that drove the call
4. **Portfolio Insights** — underweight/overweight totals, BUY/AVOID signal counts, dry powder, tranche utilization, blended expense ratio, top tilts
5. **Top buy recommendations** — cards with ticker, signal badge, $ to deploy, shares, RSI, MACD hist, day's % change, Fidelity deep link; reconciliation footer showing $X of $Y tranche allocated
6. **Allocation table** (full-width) — Ticker · Role · ER · Today · Price · Target % · Current % · Target $ · Current $ · Drift $ · Buy this tranche · Δ after buys · Fill bar
7. **Target allocation donut** with side-by-side legend
8. **Price + RSI chart** per ETF (6-month, selectable)
9. **Staged capital deployment** — 4-tranche table with executed/next/pending status (auto-advances from executions)
10. **Agent cards** — each agent's reasoning trace
11. **Fidelity execution** — copy-ready tickets + per-ticker deep links
12. **Log your executions** — record actual buys (auto-prefilled from recommendations), phase progress bar, hard cap with override, history table with undo

## Tech

- Next.js 14 (App Router) + TypeScript + TailwindCSS
- `yahoo-finance2` for live quotes + chart
- `recharts` for charts (theme-aware tooltips via CSS variables)
- File-based execution log at `data/executions.json` and `data/stocks/executions.json` (gitignored)
- Pure-TS Elliott Wave counter — no external services or APIs

## Project structure

```
app/
  layout.tsx, page.tsx
  api/
    quotes/route.ts
    history/route.ts
    pipeline/route.ts
    executions/route.ts, executions/[id]/route.ts
components/
  TickerMarquee, HeroSummary, RegimeBanner, PortfolioInsights,
  BuyRecommendations, AllocationTable, AllocationDonut, PriceChart,
  DeploymentPlan, AgentCards, FidelityPanel, ExecutionLog, ThemeToggle
  ui/{Card, Badge, Button, ProgressBar, cn}
lib/
  yahoo.ts          # Yahoo Finance wrapper + 5-min cache
  indicators.ts     # SMA, RSI, MACD
  regime.ts         # 4-mode SPY regime detector
  phaseCap.ts       # phase budget calculator
  store.ts          # executions.json store + holdings aggregation
  format.ts         # currency / percent formatters
  agents/
    portfolioState, allocationStrategy, signalAnalysis,
    capitalDeployment, executionDecision, index (runPipeline)
  screener/
    index.ts          # orchestrator: runScreener({mode, discovery})
    types.ts          # ScreenerMode, gates, fundamentals/moat/trend
    fundamentals.ts   # gate 1 — classic + gem variants
    moat.ts           # gate 2 — classic + gem variants
    trend.ts          # gate 3 — classic / gem / early-IPO evaluators
    score.ts          # confidence + regime modifier
    momentum.ts       # RS, frog-in-pan, volume thrust, base length
    discovery.ts      # gem-mode ETF holdings feed (ARKK/SMH/...)
config/portfolio.ts   # capital, buffer, ETF targets, tranches
config/screener-themes.ts # screener universe by theme
types/index.ts        # shared TypeScript types
data/executions.json  # your buy log (gitignored)
```

## Customizing

- **Different capital / buffer?** Use the in-dashboard "Edit sizing" control, or edit `CAPITAL` and `CASH_BUFFER` in `config/portfolio.ts` (ETFs) / `config/stocks.ts` (Stocks).
- **Different ETFs / weights?** Edit `TARGETS` in `config/portfolio.ts` — weights must sum to 1.0.
- **Different stock universe?** Edit `STOCK_TARGETS` in `config/stocks.ts`. Each entry has a `tier` (`core | growth | speculative`) that drives per-name caps and ZigZag thresholds.
- **Different tranche plan?** Edit `TRANCHES`. Each tranche has `size`, a human-readable `gate`, and a structured `triggers` object (`daysFromStart`, `spyDrawdownPct`, `trendConfirmation`) with OR semantics. Sizes should sum to `CAPITAL`.
- **Tighter signal thresholds?** Edit `lib/agents/signalAnalysis.ts` (RSI thresholds + MACD confirmation rule).
- **Different regime sensitivity?** Edit `lib/regime.ts` (thresholds + multipliers per mode).
- **Override an Elliott Wave count?** Edit `config/elliott-wave.json` — set `phase` to anything other than `UNKNOWN` and the auto-counter will skip that ticker.
- **Different screener universe?** Edit `config/screener-themes.ts` — themes map to `ThemeKey` and each theme has a `tickers[]` array with `tag` (`leader | emerging | venture`).
- **Tune screener thresholds?** Edit `lib/screener/{fundamentals,moat,trend,score}.ts`. Classic and gem variants are split into per-mode functions; classic is byte-identical to the original logic.

## Disclaimer

Educational use only. Not investment advice. ETFs involve risk including possible loss of principal. The crypto/biotech ETFs in this portfolio (XBI) and the semiconductor ETF (SMH) are more volatile than broad-market equity ETFs. Fidelity has no public retail trading API; all orders are reviewed and placed manually inside Fidelity.
