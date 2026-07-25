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
// Per-name max-position caps and per-sleeve caps (when configured on the
// bundle) are *hard* enforced — buys that would breach either are blocked
// (skip-code "position-cap" / "sleeve-cap") so live data drift can't push
// real-money exposure past the user's plan.
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
  opts: {
    applySectorCap?: boolean;
    sleeveCaps?: Record<string, { hardPct: number; softPct?: number }>;
    roleToSleeve?: Record<string, string>;
    // Dollars rejected upstream because of data quality issues — surfaced
    // here so the under-deployment summary can include them.
    dataQualitySkips?: { ticker: string; reason: string }[];
    // Anchor for caps: pass committed capital ($700K) instead of floating NAV
    // so position limits don't move with mark-to-market. Falls back to
    // portfolioValue when not provided (back-compat with ETF/Stocks).
    capitalAnchor?: number;
    // H9 — Leveraged-ETF policy. When `bundleKind === "fomc"` we apply two
    // extra guardrails to SOXL/TQQQ-class names because daily-reset 3× ETFs
    // bleed value in choppy / bearish tape and shine on big-trend days:
    //   1. `regimeKind`: skip leveraged buys when the market is in
    //      "pullback"/"correction" — defer until we have a directional read.
    //   2. `fomcDayOnly`: when true, only allow leveraged buys on the FOMC
    //      decision day itself (the explicit catalyst the playbook is sized
    //      around). On all other days surface a "leveraged-non-fomc-day"
    //      skip so the under-deployment summary explains why no SOXL/TQQQ
    //      buy this tranche.
    leveragedPolicy?: {
      regimeKind?: "rally" | "neutral" | "pullback" | "correction";
      fomcDayOnly?: boolean;
      isFomcDay?: boolean;
      leveragedTickers?: string[];
    };
    // N16 — broker supports fractional shares (Fidelity, Schwab Stock Slices,
    // Robinhood). When true, we don't round down to whole shares, so small
    // tranches still produce a valid buy (no more "fractional-share" skips
    // for high-priced names like NVDA / AVGO). Default false for back-compat.
    allowFractionalShares?: boolean;
  } = {},
): AgentResult<ExecutionDecisionOutput> {
  const applySectorCap = opts.applySectorCap ?? true;
  const sleeveCaps = opts.sleeveCaps ?? {};
  const roleToSleeve = opts.roleToSleeve ?? {};
  const capAnchor = (opts.capitalAnchor && opts.capitalAnchor > 0) ? opts.capitalAnchor : portfolioValue;
  const levPolicy = opts.leveragedPolicy ?? {};
  const LEVERAGED = new Set(levPolicy.leveragedTickers ?? ["SOXL", "TQQQ", "UPRO", "TNA", "FNGU", "LABU"]);
  const sigByTicker = new Map(signals.map((s) => [s.ticker, s]));
  const nameByTicker = new Map(targets.map((t) => [t.ticker, t.name]));
  const targetByTicker = new Map(targets.map((t) => [t.ticker, t]));
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

  // Data-quality skips arrive pre-classified from the pipeline; surface
  // them in `skipped` so the under-deployment summary explains "why no
  // buy for X" without forcing every consumer to look at dataHealth.
  for (const dq of opts.dataQualitySkips ?? []) {
    skipNote(dq.ticker, "data-quality", dq.reason);
  }
  const dqSkip = new Set((opts.dataQualitySkips ?? []).map((d) => d.ticker));

  // Sleeve consumption tracker — anchored to capAnchor so caps are stable
  // even when MTM swings during deployment.
  const sleeveCurrentUsd = new Map<string, number>();
  for (const d of drift) {
    const sl = roleToSleeve[d.role];
    if (!sl) continue;
    sleeveCurrentUsd.set(sl, (sleeveCurrentUsd.get(sl) ?? 0) + d.currentUsd);
  }
  const sleeveCapDollars = (sl: string): number | null => {
    const cap = sleeveCaps[sl]?.hardPct;
    if (cap == null) return null;
    return cap * capAnchor;
  };

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
    if (dqSkip.has(d.ticker)) continue;          // already noted above
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
    // H9 — leveraged ETF guardrails (no-op when leveragedPolicy is empty).
    if (LEVERAGED.has(d.ticker)) {
      const rk = levPolicy.regimeKind;
      if (rk === "pullback" || rk === "correction") {
        skipNote(d.ticker, "leveraged-bear-regime", `Leveraged 3× ETF blocked in ${rk} regime — daily-reset decay bleeds value in choppy/bearish tape.`);
        continue;
      }
      if (levPolicy.fomcDayOnly && !levPolicy.isFomcDay) {
        skipNote(d.ticker, "leveraged-non-fomc-day", `Leveraged 3× ETF restricted to FOMC decision day only — defer until catalyst.`);
        continue;
      }
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

    // Per-name max position cap (e.g. speculative names capped at 2-3%).
    // Compute remaining headroom and clamp baselineDollars accordingly.
    // ANCHOR = committed capital (capAnchor), NOT floating NAV — so a price
    // dip doesn't artificially "loosen" the cap and let us over-buy.
    const tgt = targetByTicker.get(d.ticker);
    let cappedBaseline = baselineDollars;
    if (tgt?.maxPositionPct != null && capAnchor > 0) {
      const capDollars = tgt.maxPositionPct * capAnchor;
      const headroom = Math.max(0, capDollars - d.currentUsd);
      if (headroom < baselineDollars) {
        if (headroom <= 0) {
          skipNote(
            d.ticker,
            "position-cap",
            `Position $${Math.round(d.currentUsd).toLocaleString()} ≥ cap $${Math.round(capDollars).toLocaleString()} (${(tgt.maxPositionPct * 100).toFixed(1)}% of committed capital).`,
          );
          continue;
        }
        cappedBaseline = headroom;
      }
    }

    // Sleeve cap — hard enforced when the bundle declares sleeveCaps.
    // Computed against the SAME anchor as position caps, and tracks running
    // sleeve consumption so multiple candidates in the same sleeve can't
    // collectively breach the cap.
    const sleeve = roleToSleeve[d.role];
    if (sleeve) {
      const sCap = sleeveCapDollars(sleeve);
      if (sCap != null) {
        const curSleeve = sleeveCurrentUsd.get(sleeve) ?? 0;
        const sleeveHeadroom = Math.max(0, sCap - curSleeve);
        if (sleeveHeadroom <= 0) {
          skipNote(
            d.ticker,
            "sleeve-cap",
            `Sleeve "${sleeve}" already at $${Math.round(curSleeve).toLocaleString()} ≥ cap $${Math.round(sCap).toLocaleString()}.`,
          );
          continue;
        }
        if (sleeveHeadroom < cappedBaseline) {
          cappedBaseline = sleeveHeadroom;
        }
      }
    }

    const cap = applySectorCap
      ? sectorCapMultiplier({
          ticker: d.ticker,
          role: d.role,
          buyDollars: cappedBaseline,
          portfolioValue,
          currentSectorExposures,
          buyEtfSectors: etfSectorsByTicker.get(d.ticker) ?? [],
        })
      : { multiplier: 1, sector: "—", currentSectorPct: 0, projectedSectorPct: 0, reason: "" };

    if (cap.multiplier === 0) {
      skipNote(d.ticker, "sector-cap-hard", cap.reason);
      continue;
    }

    const targetDollars = cappedBaseline * cap.multiplier;
    const fractional = opts.allowFractionalShares === true;
    // Fractional shares: keep 4 decimals (Fidelity/Schwab precision).
    const sharesRaw = d.price > 0 ? targetDollars / d.price : 0;
    const shares = fractional ? Math.round(sharesRaw * 10000) / 10000 : Math.floor(sharesRaw);
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
    if (sleeve) sleeveCurrentUsd.set(sleeve, (sleeveCurrentUsd.get(sleeve) ?? 0) + dollars);
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
        `$${Math.round(cappedBaseline).toLocaleString()} target → ${shares} sh @ $${d.price.toFixed(2)} ` +
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
