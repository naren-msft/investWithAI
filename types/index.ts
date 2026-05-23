export type Ticker = string;

export interface TargetWeight {
  ticker: Ticker;
  name: string;
  weight: number;
  expense: number;   // expense ratio (decimal, e.g. 0.0015 = 0.15%)
  role: string;      // short role/theme label
  note?: string;
}

export interface Holding {
  ticker: Ticker;
  shares: number;
  costBasis: number;
}

export interface TrancheTriggers {
  // Any of these, if set, can unlock the phase (OR semantics).
  daysFromStart?: number;        // e.g. 30 — unlocks after N days since P1 anchor
  spyDrawdownPct?: number;       // e.g. 0.05 — unlocks when SPY drops ≥ 5% from anchor peak
  trendConfirmation?: boolean;   // unlocks when regime === "rally"
}

export type TrancheStatus = "executed" | "ready" | "locked" | "filled";

export interface Tranche {
  phase: number;
  size: number;
  gate: string;                           // human-readable description
  triggers?: TrancheTriggers;             // structured triggers for the gate engine
  status: TrancheStatus;
}

export interface PhaseGateState {
  phase: number;
  size: number;
  // Cumulative-dollar bookkeeping
  consumedInPhase: number;
  remainingInPhase: number;
  isFilled: boolean;
  // Gate detection
  gateMet: boolean;
  gateReason: string;                     // why the gate is or isn't met
  unmet: {
    daysFromStart?: { needed: number; elapsed: number };
    spyDrawdownPct?: { needed: number; actual: number };
    trendConfirmation?: { satisfied: boolean };
  };
  status: TrancheStatus;
}

export interface PortfolioConfig {
  capital: number;
  cashBuffer: number;          // reserved cash, never deployed
  targets: TargetWeight[];
  tranches: Tranche[];
  holdings: Holding[];
  cash: number;
}

export interface Quote {
  ticker: Ticker;
  price: number;
  changePct: number;
  asOf: string;
}

export interface Candle {
  date: string;
  close: number;
  high: number;
  low: number;
  open: number;
  volume: number;
}

export interface Indicators {
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  sma50: number;
  sma200: number;
}

export type RegimeKind = "rally" | "neutral" | "pullback" | "correction";

export interface Regime {
  kind: RegimeKind;
  multiplier: number;          // applied to underweight (effective weight)
  inputs: {
    spy50: number;
    spy200: number;
    spyPrice: number;
    pct50: number;
    pct200: number;
    rsi14?: number;
    adx14?: number;
    smaCrossSeparation?: number; // (spy50 - spy200) / spy200 — positive = bullish
  };
  reasoning: string;
  // Multi-factor breakdown for the RegimeBanner.
  factors?: {
    label: string;
    passed: boolean;
    detail?: string;
  }[];
  // Hysteresis state for transparency in the UI.
  hysteresis?: {
    rawKind: RegimeKind;          // unsmoothed regime today
    effectiveKind: RegimeKind;    // what gets used downstream (== this.kind)
    pendingKind: RegimeKind | null;
    pendingDays: number;
    dwellRequired: number;
  };
}

export interface DriftRow {
  ticker: Ticker;
  name: string;
  role: string;
  expense: number;
  targetPct: number;
  currentPct: number;
  targetUsd: number;
  currentUsd: number;
  driftUsd: number;
  driftPct: number;
  effectiveWeight: number;
  price: number;
  shares: number;
  dayChangePct: number;
}

export type Signal = "BUY" | "HOLD" | "AVOID";

export interface SignalRow {
  ticker: Ticker;
  signal: Signal;
  rsi: number;
  macdHist: number;
  reason: string;
}

export interface BuyRecommendation {
  ticker: Ticker;
  name: string;
  dollars: number;
  shares: number;
  price: number;
  signal: Signal;
  rsi: number;
  macdHist: number;
  okToBuy: boolean;
  reason: string;
  dayChangePct: number;
}

// Reasons an underweight ETF can be excluded from this tranche's buys.
export type SkippedBuyCode =
  | "avoid-rsi"
  | "rsi-overbought"
  | "not-underweight"
  | "drift-tiny"
  | "sector-cap-hard"
  | "sector-cap-soft-zero"
  | "tranche-zero"
  | "fractional-share"
  | "other";

export interface SkippedBuy {
  ticker: Ticker;
  code: SkippedBuyCode;
  reason: string;
}

// Structured tranche-sizing breakdown — single source of truth used by
// RiskPanel / RegimeBanner / AgentCards / UnderDeploymentSummary so each
// surface shows consistent numbers and language.
export interface DeploymentSizing {
  baseTranche: number;            // nominal tranche size for the current phase
  regimeMultiplier: number;       // from Regime.multiplier
  betaThrottle: {
    multiplier: number;
    level: "none" | "soft" | "hard";
    investedBeta: number;
    projectedBeta: number;
    targetBeta: number;
    reason: string;
  };
  volGate: {
    vix: number;
    level: "calm" | "normal" | "elevated" | "stress" | "crisis" | "unknown";
    cap: number;                  // max allowed final multiplier
    reason: string;
  };
  concentrationThrottle: {
    multiplier: number;           // ∈ {1.0, 0.85, 0.6} — slows tranche when HHI is elevated
    level: "none" | "soft" | "hard";
    hhi: number;
    label: "diversified" | "moderate" | "concentrated" | "highly-concentrated";
    reason: string;
  };
  preCap: number;                 // base × regime × β-throttle × concentration-throttle (before vol cap)
  finalMultiplier: number;        // (regime × beta) capped by volGate.cap
  finalDollars: number;           // dollars actually deployed this tranche
  headroomCap: number;            // phase remaining headroom
  deployableCash: number;         // cash − reserved buffer
  capsApplied: string[];          // human-readable list of caps that bound the final
}

export interface AgentResult<T = unknown> {
  agent: string;
  output: T;
  reasoning: string;
}

export interface PipelineResult {
  asOf: string;
  capital: number;
  cashBuffer: number;
  deployedUsd: number;
  cashUsd: number;
  portfolioValue: number;
  dayPnlUsd: number;
  regime: Regime;
  drift: DriftRow[];
  signals: SignalRow[];
  recommendations: BuyRecommendation[];
  skippedBuys: SkippedBuy[];
  currentTranche: Tranche;
  trancheBudget: number;
  sizing: DeploymentSizing;
  totalRecommendedUsd: number;
  currentPhaseDeployedUsd: number;
  currentPhaseRemainingUsd: number;
  phaseReady: boolean;          // false when all phases are locked or filled
  phaseLockedReason?: string;
  // 5-phase deployment state for UI surfaces.
  phaseGates: PhaseGateState[];
  // Anchor info used by the gate engine (peak SPY since P1 start).
  phaseAnchor: {
    anchorDate: string;          // YYYY-MM-DD — date of first execution (or today if none)
    daysSinceStart: number;
    spyPeak: number;             // peak SPY close since anchorDate
    spyPeakDate: string;
    spyPrice: number;            // latest SPY close
    spyDrawdownFromPeak: number; // positive number, e.g. 0.034 = 3.4% drawdown
    maxDrawdownSinceAnchor: number; // largest drawdown experienced since anchor
    hasExecutions: boolean;
  };
  // Forward-looking risk metrics (computed from 1–3yr historical price action,
  // not from execution history).
  forwardRisk: {
    portfolioBeta: number;        // β of TARGET weights (long-run plan β)
    investedBeta: number;         // β of CURRENTLY HELD weights (excl. cash); NaN if none
    projectedBeta: number;        // β after next tranche fills at target (drives throttle)
    etfBetas: Record<string, number>;
    etfWorstRolling12mo: Record<string, number>;
    etfParametric2Sigma: Record<string, number>;
    hhi: number;
    effectiveN: number;
    concentrationLabel: "diversified" | "moderate" | "concentrated" | "highly-concentrated";
  };
  // What-if scenario outputs (pure-functional from current state).
  scenarios: ScenarioResult[];
  // Sector overlap snapshot — portfolio-weighted sector exposure (target weights).
  // Empty when overlap fetch failed.
  sectorExposures: { sector: string; effectiveWeight: number }[];
  agents: AgentResult[];
}

// What-if scenario engine — aggregate-level only (does not re-run the regime
// classifier; rally trend confirmation must be explicitly assumed by the
// scenario spec).
export interface ScenarioSpec {
  id: string;
  name: string;
  spyMovePct: number;        // e.g. -0.10 for SPY −10% from current
  vixAssumed: number;
  assumeRally?: boolean;     // forces trend-confirmation gate to evaluate as satisfied
  description: string;
  probability?: number;      // 0..1 — subjective probability weight for expected-value calcs
}

export interface ScenarioResult {
  spec: ScenarioSpec;
  syntheticSpyPrice: number;
  syntheticDrawdownFromPeak: number;
  // Per-phase: would the gate be met under this scenario?
  phaseOutcomes: {
    phase: number;
    size: number;
    wasReady: boolean;        // already ready in real life
    nowReady: boolean;        // ready under the scenario
    newlyUnlocked: boolean;   // wasReady=false && nowReady=true
    note: string;             // why (e.g. "drawdown −12% ≥ −12% trigger")
  }[];
  cumulativeNewlyUnlockedUsd: number;
  projectedPortfolioValue: number; // current × (1 + spyMove × investedBeta)
  scenarioVolGate: {
    cap: number;
    level: string;
    reason: string;
  };
  nextTrancheUnderScenario: number; // base × regimeMultiplier × beta capped by scenario vol gate
}
