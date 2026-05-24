import type { GateCheck, GateResult, ScreenerFundamentals, ScreenerMode } from "./types";
import type { ThemeTicker } from "@/config/screener-themes";

export function evaluateMoat(
  f: ScreenerFundamentals,
  entry: ThemeTicker,
  price: number | null,
  mode: ScreenerMode = "classic",
): GateResult {
  return mode === "gem"
    ? evaluateMoatGem(f, entry, price)
    : evaluateMoatClassic(f, entry, price);
}

// Classic — unchanged behavior. Max 25, pass ≥14.
function evaluateMoatClassic(
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

// Gem mode — same max=25 budget. Replaces the +4 "analyst count ≥5" reward
// (anti-gem per Arbel et al. 1983) with a tag-aware neglect bonus, and adds
// an insider-cluster check (replaces target-upside, which biases toward
// over-covered names with stale consensus targets). Pass threshold ≥14.
function evaluateMoatGem(
  f: ScreenerFundamentals,
  entry: ThemeTicker,
  _price: number | null,
): GateResult {
  const checks: GateCheck[] = [];

  // Chokepoint — unchanged (8)
  {
    const ok = !!entry.chokepoint && entry.chokepoint.trim().length > 0;
    checks.push({
      ok,
      label: ok ? `Chokepoint (${entry.moatType}): ${entry.chokepoint.split(";")[0].trim()}` : "No chokepoint defined",
      contribution: ok ? 8 : 0,
      value: entry.moatType,
    });
  }

  // Analyst consensus — unchanged (6)
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

  // Institutional ownership — same threshold but valued slightly lower (4)
  // so we have room for insider cluster.
  {
    const v = f.institutionsPercentHeld;
    const threshold = entry.tag === "venture" ? 0.20 : 0.50;
    const ok = v != null && v >= threshold;
    checks.push({
      ok,
      label: v != null
        ? `Institutional ownership ${(v * 100).toFixed(0)}% (≥${(threshold * 100).toFixed(0)}%)`
        : "Institutional ownership unavailable",
      contribution: ok ? 4 : 0,
      value: v != null ? `${(v * 100).toFixed(0)}%` : "n/a",
    });
  }

  // Neglect bonus — inverted analyst count signal (3 pts).
  // For emerging/venture, low coverage is a discovery edge. For core, modest
  // weighting to avoid penalizing established names.
  {
    const v = f.numberOfAnalystOpinions;
    let pts = 0;
    let label = "Analyst count unavailable";
    let ok = false;
    if (v != null) {
      if (entry.tag === "core") {
        // Core: prefer moderate-to-strong coverage (5–15). Tail beyond 15 = consensus.
        if (v >= 5 && v <= 15) { pts = 3; ok = true; label = `${v} analysts (healthy coverage)`; }
        else if (v > 15)       { pts = 1; ok = false; label = `${v} analysts (consensus territory)`; }
        else                   { pts = 0; ok = false; label = `${v} analysts (thin for core)`; }
      } else {
        // Emerging/venture: low coverage IS the gem edge (Arbel et al. 1983).
        if (v <= 3)            { pts = 3; ok = true; label = `${v} analysts (neglect premium — discovery phase)`; }
        else if (v <= 8)       { pts = 2; ok = true; label = `${v} analysts (early coverage)`; }
        else if (v <= 12)      { pts = 1; ok = false; label = `${v} analysts (well-covered)`; }
        else                   { pts = 0; ok = false; label = `${v} analysts (over-covered for emerging)`; }
      }
    }
    checks.push({ ok, label, contribution: pts, value: v ?? "n/a" });
  }

  // Insider cluster buying — Seyhun 1986. Last 90d distinct insider purchases.
  {
    const n = f.insiderClusterCount;
    const net = f.netInsiderShares;
    let pts = 0;
    let label = "Insider activity unavailable";
    let ok = false;
    if (n != null) {
      // Require both a cluster (≥2 distinct purchasers) AND net positive activity.
      const netOk = net == null || net >= 0;
      if (n >= 3 && netOk)      { pts = 4; ok = true; label = `${n} insider purchasers in 90d (cluster + net positive)`; }
      else if (n >= 2 && netOk) { pts = 2; ok = true; label = `${n} insider purchasers in 90d`; }
      else if (n >= 1)          { pts = 1; ok = false; label = `${n} insider purchase in 90d`; }
      else                      { pts = 0; ok = false; label = `No insider purchases in 90d`; }
    }
    checks.push({ ok, label, contribution: pts, value: n ?? "n/a" });
  }

  const score = checks.reduce((s, c) => s + c.contribution, 0);
  const passed = score >= 14;
  return { passed, score, maxScore: 25, checks };
}
