import type { AgentResult, DriftRow, Holding, PortfolioConfig, Quote } from "@/types";

export interface PortfolioStateOutput {
  portfolioValue: number;
  cash: number;
  deployedUsd: number;
  dayPnlUsd: number;
  drift: DriftRow[];
}

// Computes current vs target allocation. The drift is straight target − current;
// the regime multiplier is NOT applied here (spec: it's applied to the underweight
// inside the Allocation Strategy Agent).
export function portfolioStateAgent(
  cfg: PortfolioConfig,
  quotes: Quote[]
): AgentResult<PortfolioStateOutput> {
  const priceOf = (t: string) => quotes.find((q) => q.ticker === t)?.price ?? 0;
  const changeOf = (t: string) => quotes.find((q) => q.ticker === t)?.changePct ?? 0;

  const holdingsByTicker = new Map<string, Holding>();
  for (const h of cfg.holdings) holdingsByTicker.set(h.ticker, h);

  const equityValue = cfg.targets.reduce((s, t) => {
    const h = holdingsByTicker.get(t.ticker);
    return s + (h ? h.shares * priceOf(t.ticker) : 0);
  }, 0);
  const portfolioValue = equityValue + cfg.cash;
  const deployedUsd = equityValue;
  const dayPnlUsd = cfg.targets.reduce((s, t) => {
    const h = holdingsByTicker.get(t.ticker);
    if (!h) return s;
    const price = priceOf(t.ticker);
    const pct = changeOf(t.ticker) / 100;
    return s + h.shares * price * (pct / (1 + (pct || 1)));
  }, 0);

  const drift: DriftRow[] = cfg.targets.map((t) => {
    const price = priceOf(t.ticker);
    const h = holdingsByTicker.get(t.ticker);
    const shares = h?.shares ?? 0;
    const currentUsd = shares * price;
    const targetUsd = cfg.capital * t.weight;
    const driftUsd = targetUsd - currentUsd;
    const currentPct = portfolioValue > 0 ? currentUsd / portfolioValue : 0;
    return {
      ticker: t.ticker,
      name: t.name,
      role: t.role,
      expense: t.expense,
      targetPct: t.weight,
      currentPct,
      targetUsd,
      currentUsd,
      driftUsd,
      driftPct: t.weight - currentPct,
      effectiveWeight: 0,
      price,
      shares,
      dayChangePct: changeOf(t.ticker),
    };
  });

  const underweightCount = drift.filter((d) => d.driftUsd > 0).length;
  const reasoning =
    `Portfolio value $${Math.round(portfolioValue).toLocaleString()} ` +
    `(equity $${Math.round(deployedUsd).toLocaleString()} + cash $${Math.round(cfg.cash).toLocaleString()}). ` +
    `${underweightCount} of ${drift.length} positions are below target.`;

  return {
    agent: "PortfolioStateAgent",
    output: { portfolioValue, cash: cfg.cash, deployedUsd, dayPnlUsd, drift },
    reasoning,
  };
}
