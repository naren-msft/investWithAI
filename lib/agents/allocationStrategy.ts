import type { AgentResult, DriftRow, Regime } from "@/types";

export interface AllocationStrategyOutput {
  drift: DriftRow[];                  // sorted descending by effectiveWeight, with effectiveWeight filled in
  totalUnderweightUsd: number;
  totalEffectiveWeight: number;       // raw sum (pre-normalization) — useful for diagnostics
}

// Spec:
//   Underweight    = Target% − Current%
//   EffectiveRaw   = max(0, Underweight) × Multiplier
//   EffectiveWeight= EffectiveRaw / Σ(EffectiveRaw)   (normalized so sum = 1)
export function allocationStrategyAgent(
  drift: DriftRow[],
  regime: Regime
): AgentResult<AllocationStrategyOutput> {
  const raw = drift.map((d) => ({
    d,
    rawEff: Math.max(0, d.driftPct) * regime.multiplier,
  }));
  const total = raw.reduce((s, r) => s + r.rawEff, 0);
  const enriched: DriftRow[] = raw.map(({ d, rawEff }) => ({
    ...d,
    effectiveWeight: total > 0 ? rawEff / total : 0,
  }));
  const sorted = [...enriched].sort((a, b) => b.effectiveWeight - a.effectiveWeight);
  const totalUnderweightUsd = drift.reduce((s, d) => s + Math.max(0, d.driftUsd), 0);

  const top = sorted
    .filter((d) => d.effectiveWeight > 0)
    .slice(0, 3)
    .map((d) => `${d.ticker} ${(d.effectiveWeight * 100).toFixed(1)}%`)
    .join(", ");
  const reasoning =
    `Regime ${regime.kind} (×${regime.multiplier}). ` +
    `Total underweight $${Math.round(totalUnderweightUsd).toLocaleString()} across ${drift.filter(d => d.driftUsd > 0).length} positions. ` +
    `Top effective weights → ${top || "none"}.`;

  return {
    agent: "AllocationStrategyAgent",
    output: { drift: sorted, totalUnderweightUsd, totalEffectiveWeight: total },
    reasoning,
  };
}
