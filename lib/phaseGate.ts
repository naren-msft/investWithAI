import type { Candle, PhaseGateState, Regime, Tranche, TrancheStatus } from "@/types";
import type { Execution } from "./store";

export interface PhaseAnchor {
  anchorDate: string;          // YYYY-MM-DD
  daysSinceStart: number;
  spyPeak: number;
  spyPeakDate: string;
  spyPrice: number;
  spyDrawdownFromPeak: number; // positive number, e.g. 0.034 = 3.4% drawdown from peak
  // Largest drawdown the market has experienced at any point since the anchor.
  // Used to gate P5's "trend confirmation" (we only release the buffer if the
  // market has actually been tested by a pullback first).
  maxDrawdownSinceAnchor: number;
  hasExecutions: boolean;
}

function todayUtcIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const a = Date.parse(`${fromIsoDate}T00:00:00Z`);
  const b = Date.parse(`${toIsoDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

// Compute the P1 anchor + SPY peak/drawdown since anchor.
export function computePhaseAnchor(execs: Execution[], spyCandles: Candle[]): PhaseAnchor {
  const hasExecutions = execs.length > 0;
  const anchorDate = hasExecutions
    ? execs.reduce((min, e) => (e.date < min ? e.date : min), execs[0].date)
    : todayUtcIsoDate();
  const today = todayUtcIsoDate();
  const daysSinceStart = daysBetween(anchorDate, today);

  const since = spyCandles.filter((c) => c.date >= anchorDate);
  const series = since.length > 0 ? since : spyCandles.slice(-1);
  let spyPeak = -Infinity;
  let spyPeakDate = anchorDate;
  // Track the largest peak-to-trough drawdown experienced at any point since
  // the anchor (running max → running drawdown).
  let runningPeak = -Infinity;
  let maxDrawdownSinceAnchor = 0;
  for (const c of series) {
    if (c.close > spyPeak) { spyPeak = c.close; spyPeakDate = c.date; }
    if (c.close > runningPeak) runningPeak = c.close;
    if (runningPeak > 0) {
      const dd = (runningPeak - c.close) / runningPeak;
      if (dd > maxDrawdownSinceAnchor) maxDrawdownSinceAnchor = dd;
    }
  }
  const spyPrice = series.length > 0 ? series[series.length - 1].close : 0;
  if (!Number.isFinite(spyPeak) || spyPeak <= 0) {
    spyPeak = spyPrice;
    spyPeakDate = anchorDate;
  }
  const spyDrawdownFromPeak = spyPeak > 0 ? Math.max(0, (spyPeak - spyPrice) / spyPeak) : 0;

  return {
    anchorDate, daysSinceStart, spyPeak, spyPeakDate, spyPrice,
    spyDrawdownFromPeak, maxDrawdownSinceAnchor, hasExecutions,
  };
}

// Evaluate gates for all tranches and split cumulative deployed dollars across them.
// Returns one PhaseGateState per tranche, plus the index of the "current" phase
// (first ready & not filled) — or the last phase if everything is filled.
export interface PhaseGateResult {
  states: PhaseGateState[];
  currentIndex: number;        // index into states; -1 if no phase is currently ready
}

export function evaluatePhaseGates(
  tranches: readonly Tranche[],
  execs: Execution[],
  anchor: PhaseAnchor,
  regime: Regime,
): PhaseGateResult {
  const deployed = execs.reduce((s, e) => s + e.shares * e.price, 0);
  const states: PhaseGateState[] = [];

  let cum = 0;
  for (const t of tranches) {
    const prevCum = cum;
    cum += t.size;

    const consumedInPhase = Math.max(0, Math.min(deployed, cum) - prevCum);
    const remainingInPhase = Math.max(0, t.size - consumedInPhase);
    const isFilled = consumedInPhase + 1e-6 >= t.size;

    // Gate evaluation
    const tr = t.triggers ?? {};
    const reasons: string[] = [];
    const unmet: PhaseGateState["unmet"] = {};
    let gateMet = false;

    if (typeof tr.daysFromStart === "number") {
      const ok = anchor.daysSinceStart >= tr.daysFromStart;
      if (ok) { gateMet = true; reasons.push(`${anchor.daysSinceStart}d ≥ ${tr.daysFromStart}d elapsed`); }
      else unmet.daysFromStart = { needed: tr.daysFromStart, elapsed: anchor.daysSinceStart };
    }
    if (typeof tr.spyDrawdownPct === "number") {
      const ok = anchor.spyDrawdownFromPeak + 1e-9 >= tr.spyDrawdownPct;
      if (ok) {
        gateMet = true;
        reasons.push(`SPY −${(anchor.spyDrawdownFromPeak * 100).toFixed(1)}% ≥ −${(tr.spyDrawdownPct * 100).toFixed(0)}% from peak`);
      } else {
        unmet.spyDrawdownPct = { needed: tr.spyDrawdownPct, actual: anchor.spyDrawdownFromPeak };
      }
    }
    if (tr.trendConfirmation) {
      // Trend confirmation = market has experienced a real pullback (≥5% drawdown
      // at some point since the anchor) AND is now in a rally regime. This
      // prevents the buffer from releasing in an uninterrupted bull run — the
      // buffer exists to be deployed after the plan has been tested by a dip.
      const PULLBACK_THRESHOLD = 0.05;
      const hadPullback = anchor.maxDrawdownSinceAnchor + 1e-9 >= PULLBACK_THRESHOLD;
      const inRally = regime.kind === "rally";
      const ok = hadPullback && inRally;
      if (ok) {
        gateMet = true;
        reasons.push(`trend confirmed (max drawdown −${(anchor.maxDrawdownSinceAnchor * 100).toFixed(1)}% then back to rally)`);
      } else {
        unmet.trendConfirmation = { satisfied: false };
      }
    }
    // No triggers at all → treat as always-met (defensive default; not used by current config).
    if (Object.keys(tr).length === 0) {
      gateMet = true;
      reasons.push("no triggers configured");
    }

    let status: TrancheStatus;
    if (isFilled) status = "filled";
    else if (consumedInPhase > 0 && consumedInPhase < t.size) {
      // Partially deployed but not full — still the active phase.
      status = gateMet ? "ready" : "ready"; // a phase that has consumed dollars is implicitly unlocked
    } else if (gateMet) status = "ready";
    else status = "locked";

    // Mark fully-executed earlier phases as "executed" (alias of filled, but
    // semantically distinct in the UI for prior phases).
    if (isFilled && consumedInPhase >= t.size) status = "executed";

    const gateReason = gateMet
      ? `Unlocked: ${reasons.join("; ")}.`
      : describeUnmet(unmet, tr);

    states.push({
      phase: t.phase,
      size: t.size,
      consumedInPhase,
      remainingInPhase,
      isFilled,
      gateMet,
      gateReason,
      unmet,
      status,
    });
  }

  // Determine "current" phase: first ready-and-not-filled phase.
  let currentIndex = states.findIndex((s) => s.status === "ready" && !s.isFilled);
  if (currentIndex === -1) {
    // No ready phase: if everything's filled, point at the last; else -1 (locked-only state).
    const allFilled = states.every((s) => s.isFilled);
    if (allFilled) currentIndex = states.length - 1;
  }

  return { states, currentIndex };
}

function describeUnmet(unmet: PhaseGateState["unmet"], tr: Tranche["triggers"]): string {
  if (!tr) return "Locked.";
  const parts: string[] = [];
  if (unmet.daysFromStart) {
    const u = unmet.daysFromStart;
    parts.push(`${u.elapsed}d of ${u.needed}d elapsed`);
  }
  if (unmet.spyDrawdownPct) {
    const u = unmet.spyDrawdownPct;
    parts.push(`SPY −${(u.actual * 100).toFixed(1)}% (need −${(u.needed * 100).toFixed(0)}%)`);
  }
  if (unmet.trendConfirmation) {
    parts.push("trend not confirmed (need ≥5% drawdown then rally)");
  }
  return parts.length > 0 ? `Locked — ${parts.join(" · ")}.` : "Locked.";
}
