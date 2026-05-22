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
];

export function findSection(id: string): HelpSection | undefined {
  return SECTIONS.find((s) => s.id === id);
}
