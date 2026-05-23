import type { ConcentrationLabel } from "@/lib/risk/concentration";

// HHI-based throttle on the next tranche size. Parallel to the β-throttle:
// when target weights are too concentrated (few effective bets), we slow the
// rate of deployment so the user has time to add a position before the
// concentration risk compounds.
//
// HHI thresholds match the labels in lib/risk/concentration.ts:
//   < 0.10  diversified         → no throttle
//   < 0.18  moderate            → no throttle
//   < 0.25  concentrated        → 0.85× soft throttle
//   ≥ 0.25  highly-concentrated → 0.60× hard throttle

export interface ConcentrationThrottleInput {
  hhi: number;
  label: ConcentrationLabel;
}

export interface ConcentrationThrottle {
  multiplier: number;       // ∈ {1.0, 0.85, 0.6}
  level: "none" | "soft" | "hard";
  hhi: number;
  label: ConcentrationLabel;
  reason: string;
}

export function concentrationThrottleFor(
  input: ConcentrationThrottleInput,
): ConcentrationThrottle {
  const { hhi, label } = input;
  if (!Number.isFinite(hhi) || hhi <= 0) {
    return {
      multiplier: 1.0,
      level: "none",
      hhi,
      label,
      reason: "HHI unavailable — concentration throttle skipped.",
    };
  }
  if (label === "highly-concentrated") {
    return {
      multiplier: 0.6,
      level: "hard",
      hhi,
      label,
      reason: `HHI ${hhi.toFixed(3)} (highly-concentrated) — hard throttle 0.60× to limit single-bet risk build-up.`,
    };
  }
  if (label === "concentrated") {
    return {
      multiplier: 0.85,
      level: "soft",
      hhi,
      label,
      reason: `HHI ${hhi.toFixed(3)} (concentrated) — soft throttle 0.85× to slow concentration build-up.`,
    };
  }
  return {
    multiplier: 1.0,
    level: "none",
    hhi,
    label,
    reason: `HHI ${hhi.toFixed(3)} (${label}) — no concentration throttle.`,
  };
}
