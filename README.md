# InvestWithAI — ETF Portfolio Dashboard

A multi-agent ETF allocation dashboard that operationalizes a staged-deployment investment plan for a brokerage account (Fidelity deep links included). Live Yahoo Finance data, 5 cooperating agents, phased capital deployment with hard caps, and full execution-loop tracking.

> **Educational / demo project — not investment advice.** The capital figures, tickers, and allocation in `config/portfolio.ts` are an **example only**; edit them for your own situation. ETFs involve risk including possible loss of principal. No warranty of any kind.

## What it does

- Pulls **live quotes and 9-month price history** for every ETF in your universe (no API key required).
- Runs a **5-agent pipeline** on every page load:
  1. **PortfolioStateAgent** — drift vs. target weights from your executions log
  2. **AllocationStrategyAgent** — `effectiveWeight = max(0, drift%) × regimeMultiplier`, normalized
  3. **SignalAnalysisAgent** — RSI-14 + MACD(12,26,9) → BUY (≤35) / HOLD / AVOID (≥70)
  4. **CapitalDeploymentAgent** — sizes the next tranche from cash − buffer, regime-scaled, capped at remaining phase budget
  5. **ExecutionDecisionAgent** — turns the above into share-level BUY tickets
- Detects **4-mode market regime** (Rally / Neutral / Pullback / Correction) from SPY SMA cross.
- Enforces **staged deployment** with phase-level hard caps (overridable).
- Provides **Fidelity deep links** (you sign in once, ticket pre-filled) and copy-ready order strings.
- **Records your real executions** in `data/executions.json` — drift, deployment progress, and recommendations all update in real time.

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
- File-based execution log at `data/executions.json` (gitignored)

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
config/portfolio.ts # capital, buffer, ETF targets, tranches
types/index.ts      # shared TypeScript types
data/executions.json # your buy log (gitignored)
```

## Customizing

- **Different capital / buffer?** Edit `CAPITAL` and `CASH_BUFFER` in `config/portfolio.ts`.
- **Different ETFs / weights?** Edit `TARGETS` — weights must sum to 1.0.
- **Different tranche plan?** Edit `TRANCHES`. Each tranche has `size`, a human-readable `gate`, and a structured `triggers` object (`daysFromStart`, `spyDrawdownPct`, `trendConfirmation`) with OR semantics. Sizes should sum to `CAPITAL`.
- **Tighter signal thresholds?** Edit `lib/agents/signalAnalysis.ts` (RSI thresholds + MACD confirmation rule).
- **Different regime sensitivity?** Edit `lib/regime.ts` (thresholds + multipliers per mode).

## Disclaimer

Educational use only. Not investment advice. ETFs involve risk including possible loss of principal. The crypto/biotech ETFs in this portfolio (XBI) and the semiconductor ETF (SMH) are more volatile than broad-market equity ETFs. Fidelity has no public retail trading API; all orders are reviewed and placed manually inside Fidelity.
