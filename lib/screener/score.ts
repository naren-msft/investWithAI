import type { ConfidenceBand, ConfidenceScore, GateResult, ScreenerFundamentals, ScreenerTrend } from "./types";
import type { RegimeKind } from "@/types";

export function computeConfidence(args: {
  gate1: GateResult;
  gate2: GateResult;
  gate3: GateResult;
  fundamentals: ScreenerFundamentals;
  trend: ScreenerTrend | null;
  regimeKind: RegimeKind;
}): ConfidenceScore {
  const { gate1, gate2, gate3, fundamentals: f, trend, regimeKind } = args;

  const requiredFields: (keyof ScreenerFundamentals)[] = [
    "revenueGrowth", "grossMargins", "freeCashflow",
    "recommendationMean", "institutionsPercentHeld", "marketCap",
  ];
  const nullCount = requiredFields.reduce((n, k) => n + (f[k] == null ? 1 : 0), 0);
  let dataQuality = 10 - nullCount * 2;
  if (!trend) dataQuality -= 2;
  dataQuality = Math.max(0, Math.min(10, dataQuality));

  const regimeMap: Record<RegimeKind, number> = {
    rally: 5, neutral: 3, pullback: 0, correction: -5,
  };
  const regime = regimeMap[regimeKind];

  const total = Math.round(gate1.score + gate2.score + gate3.score + dataQuality + regime);

  let band: ConfidenceBand;
  if (regimeKind === "correction") band = "watch-only";
  else if (total >= 75) band = "high";
  else if (total >= 55) band = "medium";
  else if (total >= 35) band = "low";
  else band = "watch-only";

  const caveats: string[] = [];
  if (nullCount >= 2) caveats.push(`${nullCount} fundamentals fields missing from Yahoo`);
  if (!trend) caveats.push("Insufficient price history (newly listed?)");
  if (f.numberOfAnalystOpinions != null && f.numberOfAnalystOpinions < 5) {
    caveats.push("Thin analyst coverage");
  }
  if (regimeKind === "correction") caveats.push("SPY in correction — new buys deferred");
  if (regimeKind === "pullback") caveats.push("SPY in pullback — consider staged entry");

  return {
    total: Math.max(0, Math.min(100, total)),
    band,
    components: {
      fundamentals: gate1.score, moat: gate2.score, trend: gate3.score,
      dataQuality, regime,
    },
    caveats,
  };
}

export function bandColor(band: ConfidenceBand): "success" | "warn" | "default" | "danger" {
  switch (band) {
    case "high": return "success";
    case "medium": return "warn";
    case "low": return "default";
    case "watch-only": return "danger";
  }
}

export function bandLabel(band: ConfidenceBand): string {
  switch (band) {
    case "high": return "High";
    case "medium": return "Medium";
    case "low": return "Low";
    case "watch-only": return "Watch only";
  }
}
