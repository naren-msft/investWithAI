import type {
  AgentResult,
  BuyRecommendation,
  DriftRow,
  SignalRow,
  SkippedBuy,
  SkippedBuyCode,
  TargetWeight,
} from "@/types";
import type { OverlapResult } from "@/lib/overlap";
import { sectorCapMultiplier } from "@/lib/risk/sectorCap";

export interface ExecutionDecisionOutput {
  recommendations: BuyRecommendation[];
  skipped: SkippedBuy[];
}

// Spec OK-to-Buy rule:
//   Must be underweight AND have allocation AND
//   (RSI ≤ 35 OR MACD bullish OR fallback to drift) AND
//   RSI < 70
// Sector caps (soft 25% / hard 35%) are then applied to scale or block buys.
// Returns BOTH the recommendations and an aligned `skipped` array of reasons
// for ETFs that were filtered out at any stage — used by the dashboard's
// "why isn't every ETF here?" / under-deployment summary.
export function executionDecisionAgent(
  drift: DriftRow[],
  signals: SignalRow[],
  trancheBudget: number,
  targets: TargetWeight[],
  overlap: OverlapResult | null,
  portfolioValue: number,
): AgentResult<ExecutionDecisionOutput> {
  const sigByTicker = new Map(signals.map((s) => [s.ticker, s]));
  const nameByTicker = new Map(targets.map((t) => [t.ticker, t.name]));
  const etfSectorsByTicker = new Map(
    (overlap?.etfHoldings ?? []).map((h) => [
      h.ticker,
      h.sectorWeightings.map((s) => ({ sector: s.sector, effectiveWeight: s.weight })),
    ]),
  );
  const currentSectorExposures = overlap?.sectorExposures ?? [];
  const skipped: SkippedBuy[] = [];
  const skipNote = (ticker: string, code: SkippedBuyCode, reason: string) =>
    skipped.push({ ticker, code, reason });

  if (trancheBudget <= 0) {
    // Surface tranche-zero as a skip for *every* underweight ETF so the
    // under-deployment summary can explain "0 buys this phase".
    for (const d of drift) {
      if (d.driftUsd > 0) {
        skipNote(
          d.ticker,
          "tranche-zero",
          "Tranche budget is $0 (phase locked, vol-cap to 0, or fully deployed).",
        );
      }
    }
    return {
      agent: "ExecutionDecisionAgent",
      output: { recommendations: [], skipped },
      reasoning: "Tranche budget is zero — no deploys this phase.",
    };
  }

  // Step 1: filter to OK-to-Buy candidates, recording skip reasons for non-candidates.
  const candidates: DriftRow[] = [];
  const DRIFT_FLOOR = 1000;
  for (const d of drift) {
    const sig = sigByTicker.get(d.ticker);
    if (d.targetPct <= 0) {
      skipNote(d.ticker, "other", "Target weight is 0.");
      continue;
    }
    if (d.driftUsd <= 0) {
      skipNote(d.ticker, "not-underweight", `Not underweight (drift ${d.driftUsd >= 0 ? "+" : ""}$${Math.round(d.driftUsd).toLocaleString()}).`);
      continue;
    }
    if (d.driftUsd < DRIFT_FLOOR) {
      skipNote(d.ticker, "drift-tiny", `Drift $${Math.round(d.driftUsd).toLocaleString()} below $${DRIFT_FLOOR.toLocaleString()} floor.`);
      continue;
    }
    if (!sig) {
      skipNote(d.ticker, "other", "Signal unavailable.");
      continue;
    }
    if (sig.signal === "AVOID") {
      skipNote(d.ticker, "avoid-rsi", `Signal AVOID — RSI ${sig.rsi.toFixed(1)} ≥ 70 (overbought).`);
      continue;
    }
    if (!Number.isNaN(sig.rsi) && sig.rsi >= 70) {
      skipNote(d.ticker, "rsi-overbought", `RSI ${sig.rsi.toFixed(1)} ≥ 70 — overbought gate.`);
      continue;
    }
    candidates.push(d);
  }

  if (candidates.length === 0) {
    return {
      agent: "ExecutionDecisionAgent",
      output: { recommendations: [], skipped },
      reasoning: "No tickers passed OK-to-Buy (underweight & RSI < 70 & not AVOID).",
    };
  }

  // Step 2: renormalize effective weights across candidates only
  const candidateTotal = candidates.reduce((s, d) => s + d.effectiveWeight, 0);

  // Step 3: size buys, apply sector cap, build final recommendations.
  const recs: BuyRecommendation[] = [];
  for (const d of candidates) {
    const sig = sigByTicker.get(d.ticker)!;
    const w = candidateTotal > 0 ? d.effectiveWeight / candidateTotal : 1 / candidates.length;
    const baselineDollars = Math.min(d.driftUsd, trancheBudget * w);

    const cap = sectorCapMultiplier({
      ticker: d.ticker,
      role: d.role,
      buyDollars: baselineDollars,
      portfolioValue,
      currentSectorExposures,
      buyEtfSectors: etfSectorsByTicker.get(d.ticker) ?? [],
    });

    if (cap.multiplier === 0) {
      skipNote(d.ticker, "sector-cap-hard", cap.reason);
      continue;
    }

    const targetDollars = baselineDollars * cap.multiplier;
    const shares = d.price > 0 ? Math.floor(targetDollars / d.price) : 0;
    const dollars = shares * d.price;

    if (shares <= 0) {
      // Either soft-cap drove it below one share, or price > target dollars.
      const code: SkippedBuyCode =
        cap.multiplier < 1 ? "sector-cap-soft-zero" : "fractional-share";
      const reason =
        cap.multiplier < 1
          ? `${cap.reason} Resulting buy < 1 share.`
          : `Sized $${Math.round(targetDollars).toLocaleString()} < 1 share @ $${d.price.toFixed(2)}.`;
      skipNote(d.ticker, code, reason);
      continue;
    }

    const capNote = cap.multiplier < 1 ? `  ${cap.reason}` : "";
    recs.push({
      ticker: d.ticker,
      name: nameByTicker.get(d.ticker) ?? d.ticker,
      dollars,
      shares,
      price: d.price,
      signal: sig.signal,
      rsi: sig.rsi,
      macdHist: sig.macdHist,
      okToBuy: true,
      dayChangePct: d.dayChangePct,
      reason:
        `Effective weight ${(w * 100).toFixed(1)}% × tranche $${Math.round(trancheBudget).toLocaleString()} = ` +
        `$${Math.round(baselineDollars).toLocaleString()} target → ${shares} sh @ $${d.price.toFixed(2)} ` +
        `(signal ${sig.signal}, RSI ${Number.isFinite(sig.rsi) ? sig.rsi.toFixed(1) : "—"}).` +
        capNote,
    });
  }

  recs.sort((a, b) => b.dollars - a.dollars);

  const totalUsd = recs.reduce((s, r) => s + r.dollars, 0);
  const top = recs.slice(0, 3).map((r) => `${r.ticker} $${Math.round(r.dollars).toLocaleString()}`).join(", ");
  const reasoning =
    `Sized ${recs.length} buy${recs.length === 1 ? "" : "s"} totaling ` +
    `$${Math.round(totalUsd).toLocaleString()} of $${Math.round(trancheBudget).toLocaleString()} tranche ` +
    `(${trancheBudget > 0 ? ((totalUsd / trancheBudget) * 100).toFixed(1) : "0"}%). ` +
    `Top: ${top || "none"}. ${skipped.length} ETF${skipped.length === 1 ? "" : "s"} skipped.`;

  return { agent: "ExecutionDecisionAgent", output: { recommendations: recs, skipped }, reasoning };
}
