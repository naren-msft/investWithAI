import type {
  PhaseGateState,
  Regime,
  ScenarioResult,
  ScenarioSpec,
  Tranche,
} from "@/types";
import type { PhaseAnchor } from "@/lib/phaseGate";
import { volGateFromVix } from "@/lib/risk/volGate";

// Aggregate-level "what if" scenario engine.
//
// IMPORTANT: this engine deliberately does NOT re-run the regime classifier
// (50DMA / 200DMA / RSI / ADX / hysteresis) on fabricated SPY history. That
// would imply more precision than is honest. Instead it:
//   - shifts the *spot* SPY price by the scenario's move
//   - recomputes drawdown against the existing historical peak
//   - evaluates ONLY the drawdown / time / trend-confirm triggers honestly
//     (trend-confirm becomes an explicit assumption flag in the spec)
//   - projects portfolio value via invested-β linearization

// Probabilities are subjective "base rate" weights based on rough historical
// frequency of these moves over a multi-month horizon. They are NOT a forecast
// — they're a prior so the dashboard can show probability-weighted expected
// deployment / value rather than just deterministic min/max bracket.
// Sum = 1.00.
export const DEFAULT_SCENARIOS: ScenarioSpec[] = [
  {
    id: "pullback",
    name: "Mild pullback",
    spyMovePct: -0.05,
    vixAssumed: 22,
    probability: 0.45,
    description: "SPY −5% from today; VIX rises to 22. Tests P2 trigger.",
  },
  {
    id: "correction",
    name: "Correction",
    spyMovePct: -0.12,
    vixAssumed: 30,
    probability: 0.20,
    description: "SPY −12% drawdown from peak; VIX 30. Triggers P4.",
  },
  {
    id: "rally",
    name: "Rally + trend confirm",
    spyMovePct: 0.10,
    vixAssumed: 14,
    assumeRally: true,
    probability: 0.35,
    description: "SPY +10% with calm VIX (14). Assumes rally regime confirms P5 release.",
  },
];

interface ScenarioInputs {
  spec: ScenarioSpec;
  tranches: readonly Tranche[];
  gateStates: PhaseGateState[];
  anchor: PhaseAnchor;
  regimeMultiplier: number;      // current regime multiplier (preserved into scenario)
  investedBeta: number;          // β of currently-held sleeve (NaN ok → uses targetBeta)
  targetBeta: number;            // β of target weights
  betaThrottleMultiplier: number; // current β-throttle multiplier (preserved into scenario)
  portfolioValue: number;        // including cash
  // Pre-scenario peak SPY (for honest drawdown recomputation).
}

export function runScenario(input: ScenarioInputs): ScenarioResult {
  const { spec, tranches, gateStates, anchor } = input;

  // Synthetic spot SPY = today's spot × (1 + move). Peak stays where it is
  // (historical fact). Drawdown is recomputed honestly against that peak —
  // a positive `spyMovePct` cannot turn a drawdown negative below 0.
  const syntheticSpyPrice = anchor.spyPrice * (1 + spec.spyMovePct);
  const syntheticDrawdownFromPeak =
    anchor.spyPeak > 0
      ? Math.max(0, (anchor.spyPeak - syntheticSpyPrice) / anchor.spyPeak)
      : 0;

  // For each phase, re-evaluate gate triggers under scenario assumptions.
  // `daysFromStart` is unchanged (scenario is a "now" snapshot, not future time).
  const phaseOutcomes = tranches.map((t, i) => {
    const real = gateStates[i];
    const tr = t.triggers ?? {};
    let nowReady = false;
    const reasons: string[] = [];

    if (typeof tr.daysFromStart === "number") {
      if (anchor.daysSinceStart >= tr.daysFromStart) {
        nowReady = true;
        reasons.push(`${anchor.daysSinceStart}d ≥ ${tr.daysFromStart}d elapsed`);
      }
    }
    if (typeof tr.spyDrawdownPct === "number") {
      if (syntheticDrawdownFromPeak + 1e-9 >= tr.spyDrawdownPct) {
        nowReady = true;
        reasons.push(
          `SPY −${(syntheticDrawdownFromPeak * 100).toFixed(1)}% drawdown ≥ −${(tr.spyDrawdownPct * 100).toFixed(0)}% trigger`,
        );
      }
    }
    if (tr.trendConfirmation) {
      if (spec.assumeRally) {
        nowReady = true;
        reasons.push("rally confirmation (assumed by scenario)");
      }
    }
    if (Object.keys(tr).length === 0) {
      nowReady = true;
      reasons.push("no triggers");
    }

    const wasReady = real.gateMet && !real.isFilled;
    const newlyUnlocked = !real.gateMet && nowReady;
    const note = nowReady
      ? `Unlocked: ${reasons.join("; ")}`
      : "Still locked under this scenario.";

    return {
      phase: t.phase,
      size: t.size,
      wasReady,
      nowReady,
      newlyUnlocked,
      note,
    };
  });

  const cumulativeNewlyUnlockedUsd = phaseOutcomes
    .filter((p) => p.newlyUnlocked)
    .reduce((s, p) => s + p.size, 0);

  // Project portfolio value: linearize via β (invested-sleeve β if known).
  // current value × (1 + spyMove × β). Cash component doesn't move.
  const beta = Number.isFinite(input.investedBeta) ? input.investedBeta : input.targetBeta;
  const projectedPortfolioValue = input.portfolioValue * (1 + spec.spyMovePct * (Number.isFinite(beta) ? beta : 1));

  // Scenario tranche sizing: take the current ready-or-next phase base and
  // apply current regime × β-throttle then the scenario's vol cap.
  const baseTranche = (() => {
    const next = gateStates.find((g) => !g.isFilled);
    if (next) return next.size;
    return tranches[tranches.length - 1].size;
  })();
  const scenarioVol = volGateFromVix(spec.vixAssumed);
  const preCap = baseTranche * input.regimeMultiplier * input.betaThrottleMultiplier;
  const capped = Math.min(preCap, baseTranche * scenarioVol.cap);
  const nextTrancheUnderScenario = Math.max(0, capped);

  return {
    spec,
    syntheticSpyPrice,
    syntheticDrawdownFromPeak,
    phaseOutcomes,
    cumulativeNewlyUnlockedUsd,
    projectedPortfolioValue,
    scenarioVolGate: {
      cap: scenarioVol.cap,
      level: scenarioVol.level,
      reason: scenarioVol.reason,
    },
    nextTrancheUnderScenario,
  };
}

export function runDefaultScenarios(
  input: Omit<ScenarioInputs, "spec">,
): ScenarioResult[] {
  return DEFAULT_SCENARIOS.map((spec) => runScenario({ ...input, spec }));
}
