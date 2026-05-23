import { PORTFOLIO, TRANCHES, buildTranches, DEFAULT_CAPITAL, DEFAULT_CASH_BUFFER } from "@/config/portfolio";
import { getQuotes, getHistory } from "@/lib/yahoo";
import { detectRegime } from "@/lib/regime";
import { aggregateHoldings, readExecutions, totalDeployed } from "@/lib/store";
import { phaseCap } from "@/lib/phaseCap";
import { computePhaseAnchor, evaluatePhaseGates } from "@/lib/phaseGate";
import { computePortfolioBeta } from "@/lib/risk/beta";
import { weightedBeta } from "@/lib/risk/betaThrottle";
import { computeEtfDrawdownStats } from "@/lib/risk/drawdown";
import { concentrationMetrics } from "@/lib/risk/concentration";
import { computeOverlap } from "@/lib/overlap";
import { appendSnapshotIfStale } from "@/lib/snapshots";
import { runDefaultScenarios } from "@/lib/scenarios";
import { portfolioStateAgent } from "./portfolioState";
import { allocationStrategyAgent } from "./allocationStrategy";
import { signalAnalysisAgent } from "./signalAnalysis";
import { capitalDeploymentAgent } from "./capitalDeployment";
import { executionDecisionAgent } from "./executionDecision";
import type { PipelineResult, Tranche } from "@/types";

// Defensive VIX fetch — returns NaN on any failure (rate-limit, network, etc.)
// so the rest of the pipeline still produces a complete result.
async function fetchVixSafe(): Promise<number> {
  try {
    const qs = await getQuotes(["^VIX"]);
    const v = qs[0]?.price;
    return typeof v === "number" && v > 0 ? v : NaN;
  } catch {
    return NaN;
  }
}

export interface RunPipelineOptions {
  /** Override total capital (USD). Defaults to env-configured CAPITAL. */
  capital?: number;
  /** Override reserved cash buffer (USD). Defaults to env-configured CASH_BUFFER. */
  cashBuffer?: number;
}

export async function runPipeline(opts: RunPipelineOptions = {}): Promise<PipelineResult> {
  // Resolve effective sizing (with safe clamping).
  const capital = Number.isFinite(opts.capital) && opts.capital! > 0
    ? Math.round(opts.capital!)
    : DEFAULT_CAPITAL;
  const cashBuffer = Number.isFinite(opts.cashBuffer) && opts.cashBuffer! >= 0
    ? Math.min(Math.round(opts.cashBuffer!), capital)
    : Math.min(DEFAULT_CASH_BUFFER, capital);

  const overridden = capital !== DEFAULT_CAPITAL || cashBuffer !== DEFAULT_CASH_BUFFER;
  const scaledTranches = overridden ? buildTranches(capital, cashBuffer) : TRANCHES;

  const baseCfg = overridden ? { ...PORTFOLIO, capital, cashBuffer } : PORTFOLIO;
  const tickers = baseCfg.targets.map((t) => t.ticker);

  const [quotes, regime, signalsAgent, executions, spyCandles, betaResult, ddStats, overlap, vix] = await Promise.all([
    getQuotes(tickers),
    detectRegime(),
    signalAnalysisAgent([...baseCfg.targets]),
    readExecutions(),
    getHistory("SPY", 12),
    computePortfolioBeta(baseCfg.targets.map((t) => ({ ticker: t.ticker, weight: t.weight }))),
    Promise.all(tickers.map((t) => computeEtfDrawdownStats(t))),
    computeOverlap(baseCfg.targets).catch(() => null),
    fetchVixSafe(),
  ]);

  const holdings = aggregateHoldings(executions);
  const deployedCash = totalDeployed(executions);

  // Concentration metrics are computed once and reused by the deployment
  // agent (throttle) and the result payload (forwardRisk).
  const conc = concentrationMetrics(baseCfg.targets.map((t) => t.weight));

  // Compute the gate-aware phase state across all 5 tranches.
  const anchor = computePhaseAnchor(executions, spyCandles);
  const gateResult = evaluatePhaseGates(scaledTranches as readonly Tranche[], executions, anchor, regime);
  const tranches: Tranche[] = scaledTranches.map((t, i) => ({
    ...t,
    triggers: t.triggers,
    status: gateResult.states[i].status,
  }));

  const cap = phaseCap(scaledTranches as readonly Tranche[], executions);
  const cfg = {
    ...baseCfg,
    holdings,
    cash: Math.max(0, baseCfg.capital - deployedCash),
    tranches,
  };

  const stateAgent = portfolioStateAgent(cfg, quotes);
  const allocAgent = allocationStrategyAgent(stateAgent.output.drift, regime);

  // Invested-sleeve β: weighted by current dollar value of holdings (excludes
  // cash). NaN if no holdings yet — capitalDeployment & throttle fall back to
  // target β so the throttle still bites *before* the user over-loads on
  // high-β positions even at the start of deployment.
  const investedPositions = stateAgent.output.drift.map((d) => ({
    ticker: d.ticker,
    valueUsd: d.currentUsd,
  }));
  const investedValue = investedPositions.reduce((s, p) => s + Math.max(0, p.valueUsd), 0);
  const investedBeta = weightedBeta(investedPositions, betaResult.etfBetas);

  const deployAgent = capitalDeploymentAgent(
    cfg.tranches,
    cfg.cash,
    cfg.cashBuffer,
    regime,
    gateResult.states,
    gateResult.currentIndex,
    {
      investedBeta,
      investedValue,
      targetBeta: betaResult.portfolioBeta,
    },
    vix,
    { hhi: conc.hhi, label: conc.label },
  );

  // Projected post-tranche β (uses the sizing's final dollars, not the base):
  // honest representation of where β will sit AFTER this tranche fires.
  const projectedBeta = deployAgent.output.sizing.betaThrottle.projectedBeta;

  const effectiveTrancheBudget = deployAgent.output.trancheBudget;
  const execAgent = executionDecisionAgent(
    allocAgent.output.drift,
    signalsAgent.output,
    effectiveTrancheBudget,
    [...cfg.targets],
    overlap,
    stateAgent.output.portfolioValue,
  );

  const totalRecommendedUsd = execAgent.output.recommendations.reduce((s, r) => s + r.dollars, 0);

  const currentState = gateResult.currentIndex >= 0
    ? gateResult.states[gateResult.currentIndex]
    : null;

  // What-if scenarios — pure functional, derived from current state.
  const scenarios = runDefaultScenarios({
    tranches: scaledTranches as readonly Tranche[],
    gateStates: gateResult.states,
    anchor,
    regimeMultiplier: regime.multiplier,
    investedBeta,
    targetBeta: betaResult.portfolioBeta,
    betaThrottleMultiplier: deployAgent.output.sizing.betaThrottle.multiplier,
    portfolioValue: stateAgent.output.portfolioValue,
  });

  const result: PipelineResult = {
    asOf: new Date().toISOString(),
    capital: cfg.capital,
    cashBuffer: cfg.cashBuffer,
    deployedUsd: stateAgent.output.deployedUsd,
    cashUsd: stateAgent.output.cash,
    portfolioValue: stateAgent.output.portfolioValue,
    dayPnlUsd: stateAgent.output.dayPnlUsd,
    regime,
    drift: allocAgent.output.drift,
    signals: signalsAgent.output,
    recommendations: execAgent.output.recommendations,
    skippedBuys: execAgent.output.skipped,
    currentTranche: deployAgent.output.currentTranche,
    trancheBudget: effectiveTrancheBudget,
    sizing: deployAgent.output.sizing,
    totalRecommendedUsd,
    currentPhaseDeployedUsd: currentState ? currentState.consumedInPhase : cap.consumedInPhase,
    currentPhaseRemainingUsd: currentState ? currentState.remainingInPhase : cap.remainingInPhase,
    phaseReady: deployAgent.output.phaseReady,
    phaseLockedReason: deployAgent.output.lockedReason,
    phaseGates: gateResult.states,
    phaseAnchor: anchor,
    forwardRisk: (() => {
      return {
        portfolioBeta: betaResult.portfolioBeta,
        investedBeta,
        projectedBeta,
        etfBetas: betaResult.etfBetas,
        etfWorstRolling12mo: Object.fromEntries(ddStats.map((s) => [s.ticker, s.worstRolling12mo])),
        etfParametric2Sigma: Object.fromEntries(ddStats.map((s) => [s.ticker, s.parametric2Sigma])),
        hhi: conc.hhi,
        effectiveN: conc.effectiveN,
        concentrationLabel: conc.label,
      };
    })(),
    scenarios,
    sectorExposures: overlap?.sectorExposures ?? [],
    agents: [stateAgent, allocAgent, signalsAgent, deployAgent, execAgent],
  };

  appendSnapshotIfStale(result).catch(() => {});

  return result;
}
