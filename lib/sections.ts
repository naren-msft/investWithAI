// Shared content manifest used by both:
//   1) The dashboard — section CardHeaders show a small `?` icon that links
//      to /help#<id> (via the HelpLink component + CardHeader's helpSection prop).
//   2) The /help page — renders one entry per section using the same data.
//
// DRY by design: change copy in ONE place, both surfaces update.

export interface HelpFAQ { q: string; a: string }

export interface HelpSection {
  id: string;
  title: string;
  oneLiner: string;           // microcopy (≤80 chars) for tooltips
  whatItIs: string;           // 1-2 sentences
  whyItMatters: string;       // 2-4 sentences
  howToRead: string[];        // bullet/ordered list items
  faqs?: HelpFAQ[];
  related?: string[];         // ids of related sections
}

export const SECTIONS: HelpSection[] = [
  {
    id: "marquee",
    title: "Today's buys ticker",
    oneLiner: "Right-to-left scrolling list of today's actionable buy recommendations.",
    whatItIs:
      "A stock-ticker-style marquee at the very top of the dashboard that scrolls the live output of the Execution Decision agent.",
    whyItMatters:
      "Lets you see the 'TL;DR' deploy plan at a glance without scrolling. If you only have 10 seconds, this is the answer to 'what should I buy right now?'",
    howToRead: [
      "Each item shows: ticker · BUY/HOLD/AVOID badge · $ to deploy · share count @ price · RSI-14 · today's intraday % with arrow.",
      "Hover anywhere on the strip to pause the scroll so you can read it.",
      "Refreshes automatically alongside the rest of the dashboard (default every 60s).",
    ],
    faqs: [
      { q: "Why is FBND never on the ticker?", a: "Because it's a bond ETF — the signal/allocation rules in the agents only emit recommendations for equity ETFs that are underweight and signal is not AVOID." },
    ],
    related: ["recommendations", "agent-cards"],
  },
  {
    id: "change-banner",
    title: "Change banner",
    oneLiner: "Amber banner that appears only when something flipped since the previous snapshot.",
    whatItIs:
      "A compact alert card that shows changes between the two most recent 5-minute snapshots. It appears only when there's actually a change.",
    whyItMatters:
      "Long-running dashboards have a problem: you walk away, come back, and don't know what changed. This banner is the answer — it surfaces regime flips, signal changes, new/dropped recommendations between snapshots, and optionally fires a desktop notification.",
    howToRead: [
      "REGIME CHANGE row: the market regime moved (e.g. RALLY → PULLBACK) with the new multiplier.",
      "Signal flips: per-ticker chip showing FROM → TO (HOLD → BUY, etc.) with color-coded states.",
      "New buy recommendations: tickers that weren't recommended before but are now, with $ size.",
      "No longer recommended: tickers that were dropped from the rec list.",
      "Bell button toggles browser desktop notifications (asks permission first).",
      "Dismiss button hides until the next actual change.",
    ],
    related: ["regime-banner", "recommendations"],
  },
  {
    id: "hero",
    title: "Hero summary",
    oneLiner: "Capital, portfolio value, deployed cash, and the page-level controls.",
    whatItIs:
      "The first card on the dashboard. Shows your total capital, what's currently invested, and what's left in cash + buffer.",
    whyItMatters:
      "It's the executive summary. Everything else on the page drills into one of these four numbers.",
    howToRead: [
      "Total capital: the planned size of this portfolio ($300K by default; edit in config/portfolio.ts).",
      "Portfolio value: live market value of your holdings + cash + buffer.",
      "Deployed: total $ in equity positions right now.",
      "Cash · buffer: available cash to deploy + the reserved buffer that's never touched ($60K by default).",
      "Top-right controls: As-of timestamp, day P/L badge, auto-refresh widget (30s/1m/2m/5m), light/dark toggle.",
    ],
    related: ["regime-banner", "execution-log"],
  },
  {
    id: "regime-banner",
    title: "Market regime banner",
    oneLiner: "Detects market mode (Rally/Neutral/Pullback/Correction) from SPY's price vs SMA.",
    whatItIs:
      "A live 4-mode market regime detector that drives the multiplier applied to underweight positions when sizing buys.",
    whyItMatters:
      "Different conditions deserve different aggressiveness. In a Rally we ease into new positions (×0.7); in a Correction we deploy heavier (×1.5). The Capital Deployment agent reads this multiplier to size the next tranche.",
    howToRead: [
      "Mode badge (Rally / Neutral / Pullback / Correction) with the active multiplier.",
      "Plain-English reasoning shows the SPY inputs that drove the call.",
      "4 metric cells: SPY price · 50d SMA · 200d SMA · % vs each.",
    ],
    faqs: [
      { q: "What triggers each mode?", a: "Rally = SPY > 5% above 50d SMA AND 50d > 200d. Pullback = SPY below 50d but above 200d × 0.95. Correction = SPY > 10% below 200d. Neutral = anything else." },
      { q: "Why use SPY, not my own portfolio?", a: "SPY is the most liquid broad-market proxy and the standard reference for risk-on/risk-off conditions. Using your own portfolio would create a circular signal." },
    ],
    related: ["agent-cards", "deployment-plan"],
  },
  {
    id: "portfolio-insights",
    title: "Portfolio insights",
    oneLiner: "Headline stats: drift totals, signal counts, dry powder, blended ER, top tilts.",
    whatItIs:
      "A KPI grid that summarizes the state of your portfolio at a glance: how out-of-balance you are, how many signals fired, what fraction of your cash is still available to deploy, and your blended expense ratio.",
    whyItMatters:
      "It's the dashboard's at-a-glance health check. Every metric on this card is a 'so what?' summary of a more detailed section below.",
    howToRead: [
      "Regime badge + multiplier.",
      "Total underweight / overweight $ across all ETFs.",
      "Signals BUY / AVOID count (out of 8 ETFs).",
      "Dry powder = cash − buffer − this-tranche recommended.",
      "Tranche utilization: % of the current tranche budget the Execution agent is recommending.",
      "Blended expense ratio: weighted average of each ETF's ER × target weight.",
      "Top tilts to fill: the most underweight tickers, by drift %.",
    ],
    related: ["regime-banner", "allocation-table"],
  },
  {
    id: "exposure",
    title: "Exposure",
    oneLiner: "How exposed am I right now — equity sleeves, international, fixed income, alternatives, cash.",
    whatItIs:
      "An aggregated view of where your capital is actually sitting. The 8 ETFs in the universe are grouped into 5 sleeves (Equity Growth, Equity Defensive, International, Fixed Income, Alternatives), each with its current $, target $, drift, and a fill bar.",
    whyItMatters:
      "The #1 question every real investor asks is 'how exposed am I to X right now?' The allocation table shows per-ETF rows; this card answers it at the sleeve level. It also surfaces dry powder (cash above the reserved buffer) and the buffer itself so you can see what's still uncommitted.",
    howToRead: [
      "Top tiles: total equity (Growth + Defensive) currently held vs. target; portfolio value with deployment %; cash remaining (above the buffer); reserved buffer (releases on P5).",
      "Per-sleeve rows show the contributing tickers, current $, target $, drift $ (green = underweight = should buy more; amber = overweight), and a fill bar.",
      "Drift signs match the convention used elsewhere: positive drift = room to deploy; negative drift = already over target.",
    ],
    faqs: [
      { q: "Why does the energy ETF (FENY) live under 'Alternatives' instead of 'Equity'?", a: "By role — FENY is classified as an inflation hedge / commodity-linked sleeve, not as a core equity allocation. The sleeve map lives in config/portfolio.ts → ROLE_TO_SLEEVE; edit there to reclassify." },
      { q: "Should sleeve currents sum to portfolio value?", a: "Yes — sleeves cover every ETF in the universe exactly once. If your executions cover all 8 tickers, sleeve currents + cash should equal capital." },
    ],
    related: ["risk-profile", "allocation-table", "overlap", "sector-mix"],
  },
  {
    id: "risk-profile",
    title: "Risk profile",
    oneLiner: "Forward-looking portfolio β, concentration (HHI / effective N), per-ETF β and worst-12mo drawdown.",
    whatItIs:
      "A forward-looking risk panel — independent of how much you've actually deployed. Portfolio β is computed from 252 trading days of daily log-return regression vs SPY for each ETF, then weight-averaged. Per-ETF worst-12mo is the empirical worst rolling 252-day return over the last 3 years.",
    whyItMatters:
      "Your equity curve panel reports realized risk (Sharpe, Sortino, β, max DD on your actual executions). That's meaningless if you've only deployed P1. This card answers a different question: 'if the market moves 10% tomorrow, how does the *plan* behave?' β=1.0 means market-like; β=0.93 means a 10% SPY drop ≈ 9.3% portfolio drop. HHI / Effective N tells you how concentrated the target allocation actually is — Effective N=6.1 means your 8 ETFs are weighted similarly to 6 equal-weight positions.",
    howToRead: [
      "Top tiles: portfolio β with one-line interpretation; HHI; effective N; average worst-12mo across the universe.",
      "Per-ETF table: target weight · β vs SPY · worst rolling 12mo return over 3yr · 2σ parametric annual DD floor.",
      "β is computed in-house (1yr daily regression). Yahoo's published β uses 3–5yr monthly data and materially understates daily β for thematic ETFs like SMH — don't be alarmed when our number is much higher than Yahoo's.",
      "Worst-12mo is empirical (fat tails included). 2σ-DD is parametric (assumes normal returns; historically underestimates tails by 20–40%).",
    ],
    faqs: [
      { q: "Why is FENY's β slightly negative right now?", a: "Energy has been mildly anti-correlated with broad equity over the last 12 months in some samples. Small-magnitude negative βs from a 252-day regression are normal noise for sector ETFs that ran on their own narrative (oil, commodities) decoupled from SPY." },
      { q: "Why is XAR's worst-12mo showing 0%?", a: "Insufficient history depth in the 3yr lookback window relative to that ETF's listing date / data availability. Will populate naturally once enough history accumulates." },
      { q: "How is HHI labeled?", a: "diversified < 0.10 < moderate < 0.18 < concentrated < 0.25 < highly-concentrated. Our 8-ETF target portfolio sits at HHI ≈ 0.16 (moderate)." },
    ],
    related: ["exposure", "equity-curve", "overlap", "hhi-throttle", "sector-mix"],
  },
  {
    id: "overlap",
    title: "Hidden concentration & sector X-ray",
    oneLiner: "Decomposes all ETFs into underlying stocks to surface true single-stock and sector exposure.",
    whatItIs:
      "An aggregation of every ETF's top-10 holdings into a single view, so you can see your real exposure to any one stock or sector across the entire portfolio.",
    whyItMatters:
      "You think you own 8 different ETFs. But NVDA sits in FELC (~9%), QQQM (~9%), and SMH (~18%). Weighted by each ETF's portfolio allocation, NVDA effectively becomes 5–10% of your entire $300K. A bad day for NVDA hits you 3× as hard as the allocation table suggests. This is the single most impactful insight in the dashboard.",
    howToRead: [
      "Top single-stock exposures (left column): each row = one underlying stock with its effective % of your total portfolio.",
      "'From:' line under each: which ETFs contribute to that exposure and at what weight inside each ETF.",
      "True sector exposure (right column): aggregated GICS sector mix across all underlying holdings.",
      "Coverage badge: Yahoo only exposes top-10 holdings per ETF, so this represents roughly 40% of total. Actual concentration is slightly higher.",
    ],
    faqs: [
      { q: "Why is NVDA only ~5% if SMH is 18% NVDA?", a: "You hold 8% in SMH, so SMH's NVDA contribution is 0.08 × 0.18 = 1.4% of your total. Add similar slices from FELC + QQQM and the total comes to ~5%." },
      { q: "Why doesn't FBND appear?", a: "It's a bond ETF — no equity holdings to decompose." },
      { q: "Can I see beyond top-10?", a: "Not via Yahoo's free data. Download each ETF's holdings CSV from the issuer (Fidelity, VanEck, SPDR) to go deeper." },
    ],
    related: ["allocation-table", "donut"],
  },
  {
    id: "equity-curve",
    title: "Portfolio growth vs SPY (with risk metrics)",
    oneLiner: "Daily portfolio value vs cost basis vs SPY-DCA — plus Sharpe/Sortino/MaxDD/Beta.",
    whatItIs:
      "An area chart of your daily portfolio market value, overlaid with the same-$ DCA SPY benchmark and your cost basis. Below the chart, an 8-cell risk-adjusted-performance card.",
    whyItMatters:
      "Answers the single most important investing question: 'Am I beating SPY?' Anything else is noise. The risk card answers the second question: 'Am I beating SPY *per unit of risk*?'",
    howToRead: [
      "Green filled area = your portfolio's market value.",
      "Orange dashed = SPY simulation. Buys the same $ on the same dates as your executions; this is what you'd have if you'd just bought SPY.",
      "Blue dashed = cumulative cost basis ($ you put in).",
      "Risk card cells: Annualized return · SPY return same period · α vs SPY · Volatility · Beta · Sharpe · Sortino · Max Drawdown · Calmar.",
      "Sharpe > 1 is good. Beta > 1 means you amplify SPY moves. Calmar > 0.5 is a healthy CAGR-to-drawdown ratio.",
    ],
    faqs: [
      { q: "Why is the chart empty?", a: "You haven't logged any executions yet. Scroll to 'Log your executions' and record your first buy." },
      { q: "What's the risk-free rate?", a: "5.25% (3-month T-bill). Used for Sharpe/Sortino numerators." },
    ],
    related: ["execution-log", "tax-lots"],
  },
  {
    id: "dividend-tracker",
    title: "Dividend tracker",
    oneLiner: "Per-ETF yield + projected annual income at your current share count.",
    whatItIs:
      "Pulls each ETF's trailing dividend yield and computes how much $ you'll receive per year based on the shares you actually hold.",
    whyItMatters:
      "Dividends are invisible in the allocation table but real money. FBND yields ~4.7% monthly — on a 7% position that's ~$1,000/yr of income. Surface it.",
    howToRead: [
      "Header badges: blended yield (weighted by current value) + total annual income estimate.",
      "4 summary cells: annual income · monthly avg · blended yield · holdings paying.",
      "Per-ETF table: ticker · shares · yield · $/share/yr · est. annual income · next ex-dividend date.",
    ],
    faqs: [
      { q: "Why is the yield '—' for some ETFs?", a: "Either the ETF doesn't pay (most growth-tilted) or Yahoo doesn't return the data. SMH and QQQM pay tiny yields; FBND pays the largest." },
    ],
    related: ["tax-lots", "allocation-table"],
  },
  {
    id: "tax-lots",
    title: "Tax lots & TLH",
    oneLiner: "Every execution = a tax lot. STCG vs LTCG, TLH candidates, LTCG countdown.",
    whatItIs:
      "Reads your execution log and treats each buy as a separate tax lot. Computes cost basis, current value, unrealized gain/loss, days held, long-term status (≥366d), and flags tax-loss-harvesting candidates.",
    whyItMatters:
      "On a $300K portfolio, the difference between short-term (37%) and long-term (20%) capital gains tax on a $50K gain is $8,500. Tax-loss harvesting can offset $3,000/yr of ordinary income. This card surfaces both.",
    howToRead: [
      "Summary cells: Unrealized STCG (37% tax) / Unrealized LTCG (20%) / Unrealized loss / TLH opportunity.",
      "STCG→LT savings hint: shows estimated $ saved if you hold ST gains to 1 year.",
      "'Approaching LTCG (60d)' panel: lots within 60 days of crossing the 1-year mark.",
      "Top TLH candidates panel: top 5 lots by loss size.",
      "Lot table: date · ticker · shares · cost/share · current/share · cost basis · value · unrealized $ · status (ST/LT/TLH badges).",
      "TLH-candidate rows are tinted red.",
    ],
    faqs: [
      { q: "What's the TLH threshold?", a: "Unrealized loss > $100 per lot. Adjust in lib/taxLots.ts if needed." },
      { q: "Are these rates accurate?", a: "Top-marginal estimates only. Your actual rate depends on your bracket. Not tax advice — consult a CPA before harvesting." },
      { q: "Does it detect wash sales?", a: "Not yet — you'd need to check if you repurchased the same ticker within 30 days of a harvested loss. Roadmap." },
    ],
    related: ["equity-curve", "execution-log"],
  },
  {
    id: "recommendations",
    title: "Top buy recommendations",
    oneLiner: "Per-ETF cards: $ to deploy, shares, signal, RSI, MACD, Fidelity deep link.",
    whatItIs:
      "The Execution Decision agent's output, rendered as cards. Each card represents one actionable buy ticket sized from this tranche's budget.",
    whyItMatters:
      "This is the concrete answer to 'what should I do right now?' Click 'Trade on Fidelity' to open the trade ticket pre-filled with the symbol.",
    howToRead: [
      "Top of each card: ticker + signal badge + price + today's % change.",
      "4 stat cells: Buy ($) · Shares · RSI-14 · MACD histogram.",
      "Reason line: short narrative explaining the sizing.",
      "Trade on Fidelity button: opens Fidelity's trade ticket with the symbol pre-filled (you'll be prompted to sign in).",
      "Reconciliation footer: total $ allocated of the tranche budget, % utilization, leftover.",
    ],
    faqs: [
      { q: "Why is a ticker not on the list?", a: "It either passed the AVOID gate (RSI ≥ 70) or has zero or negative drift." },
      { q: "Why is the recommended share count what it is?", a: "It's (effectiveWeight / sum of all effective weights) × tranche budget, capped at the remaining drift for that ETF so you don't overshoot the target." },
    ],
    related: ["agent-cards", "allocation-table", "fidelity-panel"],
  },
  {
    id: "allocation-table",
    title: "Allocation table",
    oneLiner: "Full per-ETF state: target vs current, drift, today's %, buy this tranche, Δ after buys.",
    whatItIs:
      "The master table. Every ETF in your universe with its target vs current weight, dollar drift, recommended buy for this tranche, and the resulting drift after those buys execute.",
    whyItMatters:
      "It's the source of truth for 'where am I vs where I should be?' Everything else on the dashboard is derived from this.",
    howToRead: [
      "Ticker: click to open the full per-ETF research page at /etf/[ticker].",
      "Role: short label for what this ETF does in the portfolio.",
      "ER: expense ratio (annual fee).",
      "Today: live intraday % change with up/down arrow.",
      "Target / Current / Target $ / Current $: where you should be vs where you are.",
      "Drift $: target − current. Positive (green) = underweight = buy candidate.",
      "Buy this tranche: dollars the Execution agent will deploy into this ETF now.",
      "Δ after buys: drift remaining once those buys execute. Near zero = position fully filled.",
      "Fill bar: progress toward target after recommended buys.",
      "⚠️ icon: drift > 3% (rebalance candidate).",
    ],
    related: ["recommendations", "overlap"],
  },
  {
    id: "execution-log",
    title: "Log your executions",
    oneLiner: "Record real buys; holdings, drift, equity curve, tax lots all update.",
    whatItIs:
      "A form + history table that persists your real buys to data/executions.json. Every other section of the dashboard re-derives from this list, so logging a buy here updates everything.",
    whyItMatters:
      "Closes the loop. Without it, the agents make recommendations but nothing knows what you actually executed. With it, drift / equity curve / tax lots / deployment plan all reflect reality.",
    howToRead: [
      "Phase progress bar: shows $ deployed in the current phase vs the phase cap.",
      "Form fields: Ticker (validated against universe) · Shares (>0) · Price/share (auto-prefilled from the recommendation) · Date (defaults today) · Note.",
      "'This buy: $X' live indicator below the form: shows projected cost and whether it exceeds the phase cap.",
      "Override phase cap checkbox: allows logging beyond the phase budget for legitimate cases (market opportunity, etc.). Off by default.",
      "Trash icon on each row: undo a logged execution.",
    ],
    faqs: [
      { q: "Where is this stored?", a: "data/executions.json (gitignored). Survives server restarts." },
      { q: "Can I bulk import from a CSV?", a: "Not yet — roadmap. For now, log each execution individually." },
    ],
    related: ["allocation-table", "deployment-plan", "tax-lots"],
  },
  {
    id: "donut",
    title: "Target allocation donut",
    oneLiner: "Visual of the target weights across your 8 ETFs.",
    whatItIs:
      "A donut chart of target % per ETF with a side-by-side legend.",
    whyItMatters:
      "Quick visual check of the shape of your portfolio. Are you balanced or heavily tilted in one direction?",
    howToRead: [
      "Each slice = one ETF, sized by its target weight (not current).",
      "Hover any slice to see the % and target $.",
      "Legend on the right lists every ETF with its target %.",
    ],
    related: ["allocation-table", "overlap"],
  },
  {
    id: "price-chart",
    title: "Price · RSI · MACD chart",
    oneLiner: "6-month price + RSI-14 subplot + MACD(12,26,9) subplot for any ETF.",
    whatItIs:
      "Three stacked panels: daily closing price, RSI-14 with 35/70 reference lines, and MACD line + signal + histogram. Switch tickers via the dropdown.",
    whyItMatters:
      "The signal/agent system computes these indicators behind the scenes. This panel lets you visually confirm what the agent is seeing.",
    howToRead: [
      "Top panel: 6-month daily close, green line.",
      "Middle panel: RSI-14. Red dashed at 70 (AVOID threshold), green dashed at 35 (BUY threshold).",
      "Bottom panel: MACD. Green line = MACD, red dashed = signal line, orange bars = histogram (positive = bullish, negative = bearish).",
    ],
    faqs: [
      { q: "Why 6 months?", a: "Long enough for the 200-day SMA to be meaningful, short enough that the chart isn't crowded." },
    ],
    related: ["recommendations", "agent-cards"],
  },
  {
    id: "deployment-plan",
    title: "Staged capital deployment",
    oneLiner: "4-phase tranche plan with executed/next/pending status (auto-advances from your logs).",
    whatItIs:
      "The phased deployment schedule. $140K initial tranche + 3 phased tranches of ~$33K each = $240K total deployable (with $60K reserved as cash buffer).",
    whyItMatters:
      "Lump-sum buying at a market peak is risky. Phased deployment dollar-cost-averages your entry and lets you take advantage of pullbacks.",
    howToRead: [
      "Phase column: P1 / P2 / P3 / P4.",
      "Nominal size: the planned $ for that phase.",
      "Gate: the condition for moving to that phase (time + market drawdown).",
      "Status: executed (cumulative deploy ≥ phase total) / next (current phase being filled) / pending (future).",
      "Status auto-advances as you log executions.",
    ],
    related: ["execution-log", "regime-banner"],
  },
  {
    id: "fidelity-panel",
    title: "Fidelity execution",
    oneLiner: "Copy-ready order tickets + per-ticker deep links to Fidelity's trade page.",
    whatItIs:
      "A summary of recommended trades formatted as copy-ready ticket strings (e.g. 'BUY 120 FELC @ MKT'), plus a button for each ticker that opens Fidelity's trade ticket pre-filled.",
    whyItMatters:
      "Fidelity has no retail trading API — all orders are placed manually. This panel saves you from re-typing each ticker on Fidelity's site.",
    howToRead: [
      "Top: copy-button that puts all tickets on your clipboard.",
      "Bottom: small chip per ticker — click to jump to Fidelity's trade-equity page for that symbol.",
      "You'll be prompted to sign in to Fidelity if you aren't already.",
    ],
    related: ["recommendations", "execution-log"],
  },
  {
    id: "agent-cards",
    title: "Agent pipeline",
    oneLiner: "5 deterministic agents that produce the recommendations — each card shows its reasoning.",
    whatItIs:
      "Five cooperating agents that turn live data into actionable buy decisions. Each card displays its purpose and the reasoning it emitted on this run.",
    whyItMatters:
      "Transparency. Every recommendation on the dashboard is derived from these 5 steps. Reading the cards top-to-bottom is the full audit trail.",
    howToRead: [
      "1 · PortfolioState (blue): reads current holdings + prices, computes drift vs targets.",
      "2 · AllocationStrategy (yellow): applies regime multiplier to drift, normalizes effective weights.",
      "3 · SignalAnalysis (green): per-ETF RSI-14 + MACD; emits BUY / HOLD / AVOID.",
      "4 · CapitalDeployment (red): sizes the next tranche from cash − buffer × regime, capped at phase remaining.",
      "5 · ExecutionDecision (indigo): joins drift × signal × tranche → concrete buy tickets.",
      "Each card's reasoning line is regenerated on every refresh.",
    ],
    faqs: [
      { q: "Are these LLM agents?", a: "No — they're deterministic rule-based agents. Same inputs always produce the same output. A future version could swap in an LLM behind the same interface." },
      { q: "Can I tune the rules?", a: "Yes — RSI thresholds in lib/agents/signalAnalysis.ts, regime multipliers in lib/regime.ts, allocation formula in lib/agents/allocationStrategy.ts." },
    ],
    related: ["regime-banner", "recommendations"],
  },
  {
    id: "under-deployment",
    title: "Under-deployment explained",
    oneLiner: "Dashboard-level breakdown of why the next tranche isn't fully deployed.",
    whatItIs:
      "A single card that answers 'I have $X cash — why isn't every dollar working?'. It shows the full tranche-sizing chain (base → regime → β-throttle → vol cap → headroom → cash) AND lists every ETF the Execution Decision agent excluded this run, grouped by reason.",
    whyItMatters:
      "Without this card you have to triangulate across Regime, Risk, Agent cards, and the Allocation table to figure out 'why so little buying?'. This card consolidates that into one place using the same structured `sizing` and `skippedBuys` diagnostics the pipeline emits — so the numbers are guaranteed consistent.",
    howToRead: [
      "Top tiles: tranche budget, $ recommended this run, $ unallocated, and the final multiplier vs base.",
      "Sizing chain: each line is one cap or multiplier applied to the base tranche — read top-to-bottom to see what shrank it (regime, β-throttle, VIX cap, phase headroom, deployable cash).",
      "Per-ETF blocking reasons: ETFs grouped by code — AVOID/RSI gates, drift < $1k floor, sector cap (hard or soft-zero), tranche-zero, fractional share. Count next to each group.",
      "If the unallocated badge is green, the tranche fully deployed.",
      "If 'β-throttle' or 'Vol cap' shrank the tranche, see Risk Profile for the underlying numbers.",
    ],
    faqs: [
      { q: "Why is 'Not underweight' missing from the list?", a: "Tickers that are already at or above their target weight aren't candidates for *additional* buys, so they aren't surfaced as 'blocked' — the rebalance side handles them." },
      { q: "What is the $1k drift floor?", a: "The execution agent ignores buys smaller than $1,000 of drift to avoid micro-trades. Tune it in lib/agents/executionDecision.ts." },
    ],
    related: ["recommendations", "risk-profile", "regime-banner", "agent-cards", "next-best-allocation", "hhi-throttle"],
  },
  {
    id: "scenarios",
    title: "Forward-looking scenarios",
    oneLiner: "What would happen on a −5% pullback, a −12% correction, or a +10% rally?",
    whatItIs:
      "A pure-functional scenario engine that re-prices SPY at hypothetical spots, recomputes drawdown vs the existing historical peak, and replays the phase-progression triggers honestly to predict which phase the deployment plan would be in.",
    whyItMatters:
      "Tells you, *before* the move happens: 'if SPY drops 12% would my next tranche actually fire?' or 'would the rally-confirmation phase advance trigger?'. Catches situations where you think you're protected by the plan but the trigger thresholds wouldn't actually fire on a realistic move.",
    howToRead: [
      "Pullback (−5%, VIX 22): a routine dip — typically advances drawdown-trigger phases but not rally ones.",
      "Correction (−12%, VIX 30): a real correction — checks whether deeper drawdown phases advance and whether the VIX cap clamps tranche size.",
      "Rally (+10%, VIX 14): assumes trend-confirmation is true; tests whether your rally-only phase advances would trigger.",
      "Each card shows: projected SPY price, projected drawdown, the phase the plan would be in, and the projected portfolio value at the shocked spot.",
      "Scenarios deliberately do NOT re-run the multi-factor regime model — they only shift price + VIX and let the deterministic phase triggers evaluate.",
    ],
    faqs: [
      { q: "Why doesn't the rally scenario use trend-confirmation from current data?", a: "Trend confirmation requires multi-day price action — we can't fabricate that from a single shock. The rally scenario sets assumeRally=true explicitly so the trend gate evaluates as if the rally were confirmed." },
      { q: "Can I add custom scenarios?", a: "Yes — edit DEFAULT_SCENARIOS in lib/scenarios.ts to add or change shocks (spy %, VIX, time offset)." },
    ],
    related: ["regime-banner", "deployment-plan", "risk-profile", "probability-weighted"],
  },
  {
    id: "next-best-allocation",
    title: "Next best allocation",
    oneLiner: "If a gate cleared, which ETF would absorb the next dollar — and what's blocking it today?",
    whatItIs:
      "A queue of the top-5 ETFs the Execution Decision agent skipped this run, ranked by how much unfilled drift they have. Each row shows the current block reason and the specific condition that would unlock the buy.",
    whyItMatters:
      "Connects the *skipped* list to actionable monitoring. Instead of 'X ETFs were skipped', you see exactly which threshold to watch (RSI < 70, sector cap relaxation, phase unlock) and how much capital would deploy when it clears. Effectively the pre-staged shadow plan behind the current tranche.",
    howToRead: [
      "Rows ordered by unfilled-drift dollars — bigger numbers mean a bigger buy would land if the condition cleared.",
      "Currently blocked: the reason string from the Execution Decision agent (sector cap, AVOID rating, fractional share, etc).",
      "Unlocks: the concrete condition you can watch for — e.g. 'RSI drops below 70' or 'sector exposure falls below 35%'.",
      "If the queue is empty, every eligible ETF either got bought this run or isn't underweight.",
    ],
    faqs: [
      { q: "Why only 5?", a: "Beyond top-5 the dollar amounts get small; we keep the list scannable. The full skipped list lives in Under-deployment explained." },
      { q: "What if my drift is positive (over-weight)?", a: "Over-weight ETFs aren't candidates for buys, so they aren't in this queue. They show up in the rebalance / drift table instead." },
      { q: "Does this fire orders automatically?", a: "No — it's a forward-looking display only. The Execution Decision agent re-evaluates each run with current market data." },
    ],
    related: ["under-deployment", "recommendations", "risk-profile"],
  },
  {
    id: "sector-mix",
    title: "Sector mix (Tech / Defensive / Cyclical)",
    oneLiner: "How your portfolio breaks down by economic sector — the way most investors actually think about exposure.",
    whatItIs:
      "A 4-tile summary inside the Exposure panel that maps every ETF's underlying holdings (via Yahoo `topHoldings.sectorWeightings`) into three behavioural buckets — Tech, Defensive, Cyclical — plus an Other category for unmapped / fixed-income exposure. A top-sectors bar list shows the raw GICS rollup beneath.",
    whyItMatters:
      "Sleeve labels (equity-growth, international, alts) tell you what the *role* of an ETF is in the plan, but not what it actually owns. Two ETFs in different sleeves can both be 60% Tech. This view makes hidden sector concentration visible — critical context for the HHI throttle and for spotting unintended bets.",
    howToRead: [
      "Tech = Technology + Communication Services. The biggest driver of US equity returns since 2020 and the largest single concentration risk.",
      "Defensive = Healthcare + Consumer Defensive + Utilities. Low-β sectors that hold up in drawdowns.",
      "Cyclical = Financials + Consumer Cyclical + Industrials + Energy + Basic Materials + Real Estate. Sensitive to growth / rate cycles.",
      "Other = unmapped sectors and fixed-income (bond ETFs don't report sector weightings).",
      "Top-sectors list: raw GICS sectors ranked by portfolio-weighted exposure. Bar lengths are relative to the largest sector.",
      "All percentages are computed against *target* weights × ETF sector composition — so what the portfolio looks like once fully deployed, not the partially-invested state.",
    ],
    faqs: [
      { q: "Why is Tech so high — I didn't pick a Tech ETF.", a: "Broad-market US ETFs (VTI, VOO, QQQ) carry 25–55% Tech under the hood. That's how index-cap weighting works in 2024/2025." },
      { q: "Why is the 'Other' bucket large?", a: "Bond ETFs (BND, AGG, TLT) and some alts don't report sector weightings — Yahoo returns empty. They aggregate into Other rather than being dropped." },
      { q: "Can I add a sector cap?", a: "Sector caps already exist as soft (25%) and hard (35%) limits in lib/config — they filter buy candidates in the Execution Decision agent. See lib/risk/sectorCap.ts." },
    ],
    related: ["exposure", "overlap", "risk-profile", "hhi-throttle"],
  },
  {
    id: "hhi-throttle",
    title: "HHI concentration throttle",
    oneLiner: "Portfolio is concentrated? Tranche shrinks automatically — not just visualised.",
    whatItIs:
      "A multiplier applied to the base tranche based on the portfolio's Herfindahl-Hirschman Index (HHI) concentration level. Diversified and moderate portfolios → 1.0× (no impact). Concentrated → 0.85×. Highly-concentrated → 0.60×. Stacks multiplicatively with the regime multiplier and β-throttle.",
    whyItMatters:
      "Without this, the dashboard would show 'highly-concentrated' as a yellow badge and still recommend full tranche buys — leaving you to mentally adjust position size. Making the throttle automatic closes the loop between *measuring* risk and *acting* on it. It's the same pattern as the β-throttle and vol-cap: a deterministic rule that shrinks the next purchase when a risk metric breaches a threshold.",
    howToRead: [
      "Visible in Under-deployment explained as the 'HHI throttle' bullet, with the active multiplier and the underlying HHI score.",
      "Visible in Risk Profile's HHI tile — the sub-text shows the throttle level (none / soft / hard).",
      "Thresholds match the existing HHI labels: < 0.10 diversified, < 0.18 moderate, < 0.25 concentrated, ≥ 0.25 highly-concentrated.",
      "Stack order: regime × β-throttle × HHI-throttle → vol cap → phase headroom → deployable cash. The smallest cap wins.",
    ],
    faqs: [
      { q: "Why three multipliers stacked instead of one?", a: "Each represents an independent risk source (macro regime, single-ETF beta, portfolio concentration). Compounding lets two mild signals combine into one strong scale-down without making any single rule too aggressive." },
      { q: "Can the throttle hit 0×?", a: "No — minimum is 0.60× (highly-concentrated). The vol-cap can drive tranche to zero, but the HHI throttle is designed to slow buying, not stop it. Concentration is reduced by *rebalancing*, which can't happen if buys are blocked entirely." },
      { q: "Where can I tune the thresholds?", a: "lib/risk/concentrationThrottle.ts. Both the HHI bands and the multipliers are exported constants." },
    ],
    related: ["risk-profile", "under-deployment", "sector-mix"],
  },
  {
    id: "probability-weighted",
    title: "Probability-weighted outlook",
    oneLiner: "Combines all forward scenarios into a single expected value and expected tranche size.",
    whatItIs:
      "A footer in the Forward-looking scenarios card that multiplies each scenario's projected portfolio value (and projected next-tranche size) by its prior probability and sums them. Probabilities are subjective base rates set in DEFAULT_SCENARIOS — pullback 45%, correction 20%, rally 35%.",
    whyItMatters:
      "Min/max bracket thinking ('SPY could go to X or Y') doesn't help with sizing decisions. A probability-weighted expectation does. If the rally has 35% probability and would unlock $20k of buys, while the correction has 20% probability and would unlock $30k, the expected unlock is closer to one number you can plan around — not three branches you have to mentally average.",
    howToRead: [
      "Expected portfolio value = Σ(probability × projectedPortfolioValue across scenarios). Compared to today's value to show the expected delta.",
      "Expected next tranche = Σ(probability × scenarioTrancheSize). Useful for cash planning over the next few weeks.",
      "Coverage = sum of assigned probabilities. If < 100%, the calculation re-normalises so missing scenarios don't bias the math down.",
      "Each scenario card also shows its individual prior probability above the tiles.",
    ],
    faqs: [
      { q: "Where do the probabilities come from?", a: "Subjective priors I set based on rough historical frequency of these moves over a multi-month horizon. They are NOT forecasts. Edit DEFAULT_SCENARIOS in lib/scenarios.ts to change them." },
      { q: "Why don't the probabilities sum to 1.0?", a: "They're meant to. If you remove or add scenarios you may end up with a fractional total — the dashboard re-normalises rather than refusing to display." },
      { q: "Should I act on the expected value directly?", a: "Treat it as one input among several. Probability-weighting flattens tail risk, so for risk-management decisions also look at the individual correction scenario." },
    ],
    related: ["scenarios", "regime-banner", "deployment-plan"],
  },
  {
    id: "invalidation-watch",
    title: "Elliott Wave · Invalidation Watch",
    oneLiner: "Per-symbol wave phase + the exact price that would break the count.",
    whatItIs:
      "An auto-detected Elliott Wave count for each stock in the portfolio. For every ticker it labels the current wave phase (W1–W5, A/B/C, or UNKNOWN), the invalidation price (the level at which the labeled count is proven wrong), and a primary target. Counts come from a ZigZag-pivot + Fibonacci-ratio heuristic; manual overrides in config/elliott-wave.json take precedence.",
    whyItMatters:
      "Elliott Wave's real practical value isn't predicting wave tops — it's giving you a count-specific invalidation price. Instead of a vague 'stop loss', you get a concrete level whose break means a specific structural thesis is wrong, so you can size and unwind with intention. The Invalidation Watch is purely informational today; it does NOT influence position sizing or deployment phases. Treat low-confidence counts skeptically and use it as a sanity check against the existing BUY/HOLD/AVOID pipeline, not as a standalone signal.",
    howToRead: [
      "Header badges: 'X breached' (price has broken invalidation — count is wrong), 'Y near' (within 3% of invalidation), 'N of total counted' (auto + manual coverage), 'M manual' (entries pinned in config/elliott-wave.json).",
      "Alert strip at top: red rows = breached counts (re-evaluate the thesis); amber rows = within 3% of invalidation (watch closely).",
      "Phase column: W1/W2/W3/W3-of-3 are early-to-strongest trend; W4 is a normal pause; W5 is the final push (be cautious); A/B/C are corrective phases (avoid new longs).",
      "Distance column: signed % from current price to invalidation. Positive = price safely above invalidation (bullish counts); negative on a bullish phase = breached.",
      "Confidence: 0–1 score from the Fibonacci fit. < 0.40 = weak structural fit, treat skeptically. > 0.60 = good fit (rare).",
      "Source: 'auto-zigzag-v1' = computed from price history; anything else = manual entry from config/elliott-wave.json with the date you updated it.",
    ],
    faqs: [
      {
        q: "How is the Signal column derived from the phase?",
        a: "Direct mapping from EW theory: W2 and W3 = BUY (corrective low / strongest trend leg), W3-of-3 = STRONG BUY (acceleration phase), W1 and W4 = HOLD (unconfirmed early trend / consolidation), C = HOLD (potential bottom but knife-catch), W5 = CAUTION (top forming), A and B = AVOID (corrective phases), UNKNOWN = no signal. These are EW-only signals and are independent of the dashboard's primary BUY/HOLD/AVOID recommendations (which use RSI, MACD, drift, sleeve caps, tier thresholds). Use it as a cross-check, not a replacement.",
      },
      {
        q: "What are the three Elliott Wave rules the counter enforces?",
        a: "(1) Wave 2 cannot retrace more than 100% of Wave 1 (price can't fall below W1's start). (2) Wave 3 is never the shortest among waves 1, 3, and 5. (3) Wave 4 cannot overlap Wave 1's price territory. Any auto-count that violates these is rejected before scoring.",
      },
      {
        q: "What does 'invalidation price' actually mean?",
        a: "It's the price at which the labeled count is broken. For a bullish phase (W1–W5) it's the level below which the count is wrong (e.g. W2's invalidation = W1's start; W4's = W1's top). For an A/B/C correction it's the level above which the move wasn't actually a correction (e.g. above the prior W5 high = the structure was W4 of higher degree, count moot).",
      },
      {
        q: "Why is my favorite stock showing 'UNKNOWN'?",
        a: "The auto-counter couldn't fit a clean 5-wave bullish impulse to the recent pivot structure. Common causes: < 40 days of price history, very choppy/sideways action, or pivots that violate the cardinal rules. You can manually set a count by editing config/elliott-wave.json — manual entries take precedence over auto.",
      },
      {
        q: "How is the auto-counter different from a real EW analyst?",
        a: "Big differences. It only looks at daily closes on a single timeframe, only fits bullish impulses, can't recognize diagonals/truncations/complex corrections, and has no concept of degree (the same chart could be W3 of one degree and W1 of another). It is a deterministic heuristic, not a wave expert. Treat low-confidence counts as suggestions, not signals.",
      },
      {
        q: "What's the ZigZag threshold and why is it tier-aware?",
        a: "ZigZag emits a pivot when price retraces from the running extreme by ≥ threshold%. Stocks have different typical volatility by tier, so we use: 7% for core (NVDA, ASML…), 9% for growth (CRWV, RBRK…), 12% for speculative (IONQ, QBTS, ARQQ…). Too low a threshold = noise pivots; too high = misses real structure.",
      },
      {
        q: "Does this influence what the dashboard tells me to buy?",
        a: "No. Today this card is display-only. The existing pipeline (signal analysis, drift, sleeve caps, tier thresholds, phase gating) is unchanged. If you later want EW to gate or scale recommendations, that's a deliberate additional change you'd explicitly approve.",
      },
      {
        q: "How do I override the auto count for a ticker?",
        a: "Edit config/elliott-wave.json. Set the ticker's phase (W1/W2/W3/W3-of-3/W4/W5/A/B/C/UNKNOWN), invalidationPrice (number), primaryTarget (number or null), confidence (0–1), source (e.g. 'EWF 2026-05-20'), lastUpdated (YYYY-MM-DD). The card picks it up on next refresh; auto-counting is skipped for that ticker.",
      },
    ],
    related: ["recommendations", "risk-profile", "agent-cards"],
  },
];

export function findSection(id: string): HelpSection | undefined {
  return SECTIONS.find((s) => s.id === id);
}
