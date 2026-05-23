import type { Tranche } from "@/types";
import type { Execution } from "./store";

export interface PhaseCap {
  phase: number;
  size: number;
  cumulativePhaseTarget: number;  // sum of sizes from phase 1 to this phase
  deployed: number;               // sum of executions cost (across all phases)
  consumedInPhase: number;        // deployed amount that's allocated to this phase
  remainingInPhase: number;       // size − consumedInPhase
  isFilled: boolean;              // consumedInPhase ≥ size
}

// Determine the "current" phase from deployed cash and compute the phase cap.
// Definition: current phase = first phase whose cumulative target hasn't been met.
//
// Note: gate-aware "current phase" selection lives in lib/phaseGate.ts. This
// function preserves the original dollar-cumulative logic so callers that just
// need budget bookkeeping (independent of triggers) keep working.
export function phaseCap(tranches: readonly Tranche[], execs: Execution[]): PhaseCap {
  const deployed = execs.reduce((s, e) => s + e.shares * e.price, 0);
  let cum = 0;
  let prevCum = 0;
  for (const t of tranches) {
    prevCum = cum;
    cum += t.size;
    if (deployed < cum) {
      const consumedInPhase = Math.max(0, deployed - prevCum);
      return {
        phase: t.phase,
        size: t.size,
        cumulativePhaseTarget: cum,
        deployed,
        consumedInPhase,
        remainingInPhase: Math.max(0, t.size - consumedInPhase),
        isFilled: false,
      };
    }
  }
  // All phases filled — pin to the last one
  const last = tranches[tranches.length - 1];
  return {
    phase: last.phase,
    size: last.size,
    cumulativePhaseTarget: cum,
    deployed,
    consumedInPhase: last.size,
    remainingInPhase: 0,
    isFilled: true,
  };
}
