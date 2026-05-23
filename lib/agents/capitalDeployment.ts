import type {
  AgentResult,
  DeploymentSizing,
  PhaseGateState,
  Regime,
  Tranche,
} from "@/types";
import { betaThrottleFor } from "@/lib/risk/betaThrottle";
import { volGateFromVix } from "@/lib/risk/volGate";
import { concentrationThrottleFor } from "@/lib/risk/concentrationThrottle";
import type { ConcentrationLabel } from "@/lib/risk/concentration";

export interface CapitalDeploymentOutput {
  currentTranche: Tranche;
  trancheBudget: number;     // dollars actually being deployed this phase (== sizing.finalDollars)
  deployableCash: number;    // cash − reserved buffer (P5 cash buffer kept until P5 unlocks)
  phaseReady: boolean;       // whether any phase is currently ready
  lockedReason?: string;     // when phaseReady=false, why we're waiting
  sizing: DeploymentSizing;
}

// Sizes the next tranche through a *single* multiplier stack:
//
//   preCap   = baseTranche × regimeMultiplier × betaThrottle.multiplier
//   final$   = min(preCap, baseTranche × volGate.cap, deployableCash, headroom)
//
// The vol gate is applied as a CAP on the final multiplier (not multiplied)
// so that a strong "buy the dip" regime signal (×1.5 in correction) is not
// mechanically cancelled by the high-VIX that always accompanies it. See
// lib/risk/volGate.ts for the rationale.
export function capitalDeploymentAgent(
  tranches: Tranche[],
  cash: number,
  cashBuffer: number,
  regime: Regime,
  gateStates: PhaseGateState[],
  currentIndex: number,
  betaInput: {
    investedBeta: number;
    investedValue: number;
    targetBeta: number;
  },
  vix: number,
  concentrationInput: {
    hhi: number;
    label: ConcentrationLabel;
  },
): AgentResult<CapitalDeploymentOutput> {
  // Reserve the cash buffer until phase 5 (the buffer phase) unlocks. Until
  // then, only cash above the buffer is deployable.
  const p5 = gateStates.find((g) => g.phase === 5);
  const bufferReserved = !p5 || !p5.gateMet ? cashBuffer : 0;
  const deployableCash = Math.max(0, cash - bufferReserved);

  // Pre-compute the throttle/gate using a "preview" tranche size when no phase
  // is ready (so the UI can still show what the throttle/gate would do).
  const previewBase =
    currentIndex >= 0 ? tranches[currentIndex].size : tranches[tranches.length - 1].size;
  const throttle = betaThrottleFor({
    investedBeta: betaInput.investedBeta,
    investedValue: betaInput.investedValue,
    targetBeta: betaInput.targetBeta,
    trancheBudget: previewBase,
  });
  const volGate = volGateFromVix(vix);
  const concThrottle = concentrationThrottleFor(concentrationInput);

  if (currentIndex < 0) {
    const nextLocked = gateStates.find((g) => g.status === "locked");
    const reason = nextLocked
      ? `Waiting for Phase ${nextLocked.phase}: ${nextLocked.gateReason}`
      : "All phases filled — no further deployment scheduled.";

    const sizing: DeploymentSizing = {
      baseTranche: 0,
      regimeMultiplier: regime.multiplier,
      betaThrottle: { ...throttle },
      volGate: { vix: volGate.vix, level: volGate.level, cap: volGate.cap, reason: volGate.reason },
      concentrationThrottle: { ...concThrottle },
      preCap: 0,
      finalMultiplier: 0,
      finalDollars: 0,
      headroomCap: 0,
      deployableCash,
      capsApplied: ["phase-locked"],
    };

    return {
      agent: "CapitalDeploymentAgent",
      output: {
        currentTranche: tranches[Math.max(0, tranches.length - 1)],
        trancheBudget: 0,
        deployableCash,
        phaseReady: false,
        lockedReason: reason,
        sizing,
      },
      reasoning: reason,
    };
  }

  const currentTranche = tranches[currentIndex];
  const currentState = gateStates[currentIndex];
  const headroom = currentState.remainingInPhase;
  const base = currentTranche.size;

  const preCapMultiplier = regime.multiplier * throttle.multiplier * concThrottle.multiplier;
  const preCap = Math.max(0, base * preCapMultiplier);
  const volCappedMultiplier = Math.min(preCapMultiplier, volGate.cap);
  const volCappedDollars = Math.max(0, base * volCappedMultiplier);

  // Apply headroom and deployable-cash caps last.
  const finalDollars = Math.max(
    0,
    Math.min(volCappedDollars, deployableCash, headroom),
  );

  const capsApplied: string[] = [];
  if (volCappedMultiplier < preCapMultiplier - 1e-9) capsApplied.push(`vol-cap (${volGate.level})`);
  if (throttle.multiplier < 1) capsApplied.push(`β-throttle (${throttle.level})`);
  if (concThrottle.multiplier < 1) capsApplied.push(`concentration-throttle (${concThrottle.level})`);
  if (deployableCash < volCappedDollars - 1e-6) capsApplied.push("deployable-cash");
  if (headroom < volCappedDollars - 1e-6 && headroom < deployableCash - 1e-6) capsApplied.push("phase-headroom");
  if (capsApplied.length === 0) capsApplied.push("regime-only");

  const finalMultiplier = base > 0 ? finalDollars / base : 0;

  const sizing: DeploymentSizing = {
    baseTranche: base,
    regimeMultiplier: regime.multiplier,
    betaThrottle: { ...throttle },
    volGate: { vix: volGate.vix, level: volGate.level, cap: volGate.cap, reason: volGate.reason },
    concentrationThrottle: { ...concThrottle },
    preCap,
    finalMultiplier,
    finalDollars,
    headroomCap: headroom,
    deployableCash,
    capsApplied,
  };

  const reasoning =
    `Phase ${currentTranche.phase}: base $${base.toLocaleString()} × regime ${regime.multiplier} ` +
    `× β-throttle ${throttle.multiplier} × HHI-throttle ${concThrottle.multiplier} = $${Math.round(preCap).toLocaleString()}; ` +
    `vol cap ${volGate.cap}× (${volGate.level}, VIX ${Number.isFinite(volGate.vix) ? volGate.vix.toFixed(1) : "—"}) ` +
    `→ $${Math.round(volCappedDollars).toLocaleString()}. ` +
    `Deployable cash $${deployableCash.toLocaleString()} (buffer reserved $${bufferReserved.toLocaleString()}); ` +
    `phase headroom $${headroom.toLocaleString()}. ` +
    `Final tranche $${Math.round(finalDollars).toLocaleString()} (caps: ${capsApplied.join(", ")}). ` +
    `Gate: ${currentState.gateReason}`;

  return {
    agent: "CapitalDeploymentAgent",
    output: {
      currentTranche,
      trancheBudget: finalDollars,
      deployableCash,
      phaseReady: true,
      sizing,
    },
    reasoning,
  };
}
