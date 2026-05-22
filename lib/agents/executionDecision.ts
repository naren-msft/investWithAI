import type {
  AgentResult,
  BuyRecommendation,
  DriftRow,
  SignalRow,
  TargetWeight,
} from "@/types";

// Spec OK-to-Buy rule:
//   Must be underweight AND have allocation AND
//   (RSI ≤ 35 OR MACD bullish OR fallback to drift) AND
//   RSI < 70
// Suggested buy = TrancheBudget × normalized effective weight, capped at the
// remaining drift dollars (don't overshoot target).
export function executionDecisionAgent(
  drift: DriftRow[],
  signals: SignalRow[],
  trancheBudget: number,
  targets: TargetWeight[]
): AgentResult<BuyRecommendation[]> {
  const sigByTicker = new Map(signals.map((s) => [s.ticker, s]));
  const nameByTicker = new Map(targets.map((t) => [t.ticker, t.name]));

  // Step 1: filter to OK-to-Buy candidates
  const candidates = drift.filter((d) => {
    if (d.driftUsd <= 0 || d.targetPct <= 0) return false;
    const sig = sigByTicker.get(d.ticker);
    if (!sig) return false;
    if (sig.signal === "AVOID") return false;      // explicit hard gate
    if (!Number.isNaN(sig.rsi) && sig.rsi >= 70) return false; // belt-and-suspenders
    return true;                                    // signal BUY/HOLD: drift fallback ok
  });

  if (candidates.length === 0 || trancheBudget <= 0) {
    return {
      agent: "ExecutionDecisionAgent",
      output: [],
      reasoning:
        trancheBudget <= 0
          ? "Tranche budget is zero — no deploys this phase."
          : "No tickers passed OK-to-Buy (underweight & RSI < 70 & not AVOID).",
    };
  }

  // Step 2: renormalize effective weights across candidates only
  const candidateTotal = candidates.reduce((s, d) => s + d.effectiveWeight, 0);

  // Step 3: size buys, cap each at its remaining drift to avoid overshooting target
  const recs: BuyRecommendation[] = candidates
    .map((d) => {
      const sig = sigByTicker.get(d.ticker)!;
      const w = candidateTotal > 0 ? d.effectiveWeight / candidateTotal : 1 / candidates.length;
      const targetDollars = Math.min(d.driftUsd, trancheBudget * w);
      const shares = d.price > 0 ? Math.floor(targetDollars / d.price) : 0;
      const dollars = shares * d.price;
      return {
        ticker: d.ticker,
        name: nameByTicker.get(d.ticker) ?? d.ticker,
        dollars,
        shares,
        price: d.price,
        signal: sig.signal,
        rsi: sig.rsi,
        macdHist: sig.macdHist,
        okToBuy: shares > 0,
        dayChangePct: d.dayChangePct,
        reason:
          `Effective weight ${(w * 100).toFixed(1)}% × tranche $${Math.round(trancheBudget).toLocaleString()} = ` +
          `$${Math.round(targetDollars).toLocaleString()} target → ${shares} sh @ $${d.price.toFixed(2)} ` +
          `(signal ${sig.signal}, RSI ${Number.isFinite(sig.rsi) ? sig.rsi.toFixed(1) : "—"}).`,
      };
    })
    .filter((r) => r.shares > 0)
    .sort((a, b) => b.dollars - a.dollars);

  const totalUsd = recs.reduce((s, r) => s + r.dollars, 0);
  const top = recs.slice(0, 3).map((r) => `${r.ticker} $${Math.round(r.dollars).toLocaleString()}`).join(", ");
  const reasoning =
    `Sized ${recs.length} buy${recs.length === 1 ? "" : "s"} totaling ` +
    `$${Math.round(totalUsd).toLocaleString()} of $${Math.round(trancheBudget).toLocaleString()} tranche ` +
    `(${trancheBudget > 0 ? ((totalUsd / trancheBudget) * 100).toFixed(1) : "0"}%). Top: ${top || "none"}.`;

  return { agent: "ExecutionDecisionAgent", output: recs, reasoning };
}
