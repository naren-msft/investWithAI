// Beta-aware deployment throttle.
//
// We compute β three ways:
//   - investedBeta:  β of the currently-held sleeve only (excludes cash).
//   - targetBeta:    β assuming target weights are reached (long-run plan β).
//   - projectedBeta: β after the next tranche fills at target weights, i.e.
//                    where the *invested* sleeve will be if the next tranche
//                    fires as planned. This is what the throttle keys off so
//                    that the gate bites *before* the user over-loads on
//                    high-β exposure, even early in deployment when the
//                    invested base is small.
//
// Throttle (applied to the deployment multiplier, BEFORE the VIX cap):
//   projected β ≤ 1.05            → 1.00× (no throttle)
//   1.05 < projected β ≤ 1.15     → 0.85×
//   projected β > 1.15            → 0.60×

export interface BetaThrottleInput {
  investedBeta: number;     // β of invested holdings (excl. cash). NaN if no holdings yet.
  investedValue: number;    // dollars currently invested
  targetBeta: number;       // β of target weights (long-run β)
  trancheBudget: number;    // base tranche dollars BEFORE throttle/cap
}

export interface BetaThrottle {
  multiplier: number;       // ∈ {1.0, 0.85, 0.6}
  level: "none" | "soft" | "hard";
  investedBeta: number;
  projectedBeta: number;
  targetBeta: number;
  reason: string;
}

export function projectPostTrancheBeta(input: BetaThrottleInput): number {
  const { investedBeta, investedValue, targetBeta, trancheBudget } = input;
  const safeInvested = Number.isFinite(investedBeta) ? investedBeta : targetBeta;
  const denom = investedValue + trancheBudget;
  if (denom <= 0) return targetBeta;
  return (investedValue * safeInvested + trancheBudget * targetBeta) / denom;
}

export function betaThrottleFor(input: BetaThrottleInput): BetaThrottle {
  const projectedBeta = projectPostTrancheBeta(input);
  const safeInvested = Number.isFinite(input.investedBeta) ? input.investedBeta : NaN;

  if (!Number.isFinite(projectedBeta)) {
    return {
      multiplier: 1,
      level: "none",
      investedBeta: safeInvested,
      projectedBeta: NaN,
      targetBeta: input.targetBeta,
      reason: "β unavailable — throttle skipped.",
    };
  }

  if (projectedBeta <= 1.05) {
    return {
      multiplier: 1,
      level: "none",
      investedBeta: safeInvested,
      projectedBeta,
      targetBeta: input.targetBeta,
      reason: `Projected post-tranche β ${projectedBeta.toFixed(2)} ≤ 1.05 — no throttle.`,
    };
  }
  if (projectedBeta <= 1.15) {
    return {
      multiplier: 0.85,
      level: "soft",
      investedBeta: safeInvested,
      projectedBeta,
      targetBeta: input.targetBeta,
      reason: `Projected β ${projectedBeta.toFixed(2)} ∈ (1.05, 1.15] — soft throttle 0.85× to slow equity build.`,
    };
  }
  return {
    multiplier: 0.6,
    level: "hard",
    investedBeta: safeInvested,
    projectedBeta,
    targetBeta: input.targetBeta,
    reason: `Projected β ${projectedBeta.toFixed(2)} > 1.15 — hard throttle 0.60× to protect from over-aggressive equity exposure.`,
  };
}

// Compute β of a current weight vector. Returns NaN if no positions.
export function weightedBeta(
  positions: { ticker: string; valueUsd: number }[],
  etfBetas: Record<string, number>,
): number {
  const total = positions.reduce((s, p) => s + Math.max(0, p.valueUsd), 0);
  if (total <= 0) return NaN;
  let beta = 0;
  for (const p of positions) {
    const w = Math.max(0, p.valueUsd) / total;
    const b = etfBetas[p.ticker];
    beta += w * (Number.isFinite(b) ? b : 1.0);
  }
  return beta;
}
