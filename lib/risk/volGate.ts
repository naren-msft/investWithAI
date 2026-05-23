// Volatility gate (VIX-based) — acts as a CAP on the final deployment
// multiplier, not as an independent factor that multiplies into the regime.
//
// Rationale: the regime multiplier already boosts during pullbacks/corrections
// (×1.2 / ×1.5) because those are buying opportunities. VIX usually spikes in
// exactly those conditions. Blindly multiplying `regime × vol` would turn the
// staged dip-buyer into a vol-avoider (e.g. correction ×1.5 × vol ×0.4 = ×0.6,
// less than a calm-market neutral deploy). Capping instead lets the regime
// keep its dip-buying conviction up to a stress ceiling.

export type VolLevel = "calm" | "normal" | "elevated" | "stress" | "crisis" | "unknown";

export interface VolGate {
  vix: number;          // raw VIX reading, or NaN when unavailable
  level: VolLevel;
  // Maximum allowed value for the final deployment multiplier.
  // 1.5 is effectively "no cap" since regime multiplier maxes at 1.5.
  cap: number;
  reason: string;
}

export function volGateFromVix(vix: number): VolGate {
  if (!Number.isFinite(vix) || vix <= 0) {
    return {
      vix: NaN,
      level: "unknown",
      cap: 1.5,
      reason: "VIX unavailable — vol gate skipped (cap at regime ceiling).",
    };
  }
  if (vix < 18) {
    return { vix, level: "calm", cap: 1.5, reason: `VIX ${vix.toFixed(1)} — calm; no vol cap.` };
  }
  if (vix < 22) {
    return { vix, level: "normal", cap: 1.5, reason: `VIX ${vix.toFixed(1)} — normal; no vol cap.` };
  }
  if (vix < 28) {
    return {
      vix,
      level: "elevated",
      cap: 1.0,
      reason: `VIX ${vix.toFixed(1)} ∈ [22, 28) — elevated; final multiplier capped at 1.00× (don't *boost* during stress).`,
    };
  }
  if (vix < 35) {
    return {
      vix,
      level: "stress",
      cap: 0.6,
      reason: `VIX ${vix.toFixed(1)} ∈ [28, 35) — stress; final multiplier capped at 0.60×.`,
    };
  }
  return {
    vix,
    level: "crisis",
    cap: 0,
    reason: `VIX ${vix.toFixed(1)} ≥ 35 — crisis; deployments paused until volatility cools.`,
  };
}
