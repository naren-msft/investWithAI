import type { GateCheck, GateResult, ScreenerFundamentals } from "./types";
import type { ThemeTicker } from "@/config/screener-themes";

export function evaluateMoat(
  f: ScreenerFundamentals,
  entry: ThemeTicker,
  price: number | null,
): GateResult {
  const checks: GateCheck[] = [];

  {
    const ok = !!entry.chokepoint && entry.chokepoint.trim().length > 0;
    checks.push({
      ok,
      label: ok ? `Chokepoint (${entry.moatType}): ${entry.chokepoint.split(";")[0].trim()}` : "No chokepoint defined",
      contribution: ok ? 8 : 0,
      value: entry.moatType,
    });
  }

  {
    const v = f.recommendationMean;
    const ok = v != null && v <= 2.5;
    checks.push({
      ok,
      label: v != null ? `Analyst consensus ${v.toFixed(2)} (≤2.5 = Buy or better)` : "Analyst consensus unavailable",
      contribution: ok ? 6 : 0,
      value: v?.toFixed(2) ?? "n/a",
    });
  }

  {
    const v = f.institutionsPercentHeld;
    const threshold = entry.tag === "venture" ? 0.20 : 0.50;
    const ok = v != null && v >= threshold;
    checks.push({
      ok,
      label: v != null
        ? `Institutional ownership ${(v * 100).toFixed(0)}% (≥${(threshold * 100).toFixed(0)}%)`
        : "Institutional ownership unavailable",
      contribution: ok ? 5 : 0,
      value: v != null ? `${(v * 100).toFixed(0)}%` : "n/a",
    });
  }

  {
    const v = f.numberOfAnalystOpinions;
    const threshold = entry.tag === "venture" ? 2 : 5;
    const ok = v != null && v >= threshold;
    checks.push({
      ok,
      label: v != null ? `${v} analysts covering (≥${threshold})` : "Analyst count unavailable",
      contribution: ok ? 4 : 0,
      value: v ?? "n/a",
    });
  }

  {
    const target = f.targetMeanPrice;
    const upside = target != null && price != null && price > 0 ? (target - price) / price : null;
    const ok = upside != null && upside >= 0.10;
    checks.push({
      ok,
      label: upside != null ? `Target upside ${(upside * 100).toFixed(1)}% (≥10%)` : "Target price unavailable",
      contribution: ok ? 2 : 0,
      value: upside != null ? `${(upside * 100).toFixed(1)}%` : "n/a",
    });
  }

  const score = checks.reduce((s, c) => s + c.contribution, 0);
  const passed = score >= 14;
  return { passed, score, maxScore: 25, checks };
}
