import { etfBundle } from "@/config/portfolio";
import type { PortfolioBundle } from "@/config/bundle";
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
  /** Override total capital (USD). Defaults to the bundle's default. */
  capital?: number;
  /** Override reserved cash buffer (USD). Defaults to the bundle's default. */
  cashBuffer?: number;
  /** Portfolio bundle to run. Defaults to the ETF bundle for back-compat. */
  bundle?: PortfolioBundle;
}

export async function runPipeline(opts: RunPipelineOptions = {}): Promise<PipelineResult> {
  const bundle = opts.bundle ?? etfBundle;

  // Resolve effective sizing (with safe clamping).
  const capital = Number.isFinite(opts.capital) && opts.capital! > 0
    ? Math.round(opts.capital!)
    : bundle.defaultCapital;
  const cashBuffer = Number.isFinite(opts.cashBuffer) && opts.cashBuffer! >= 0
    ? Math.min(Math.round(opts.cashBuffer!), capital)
    : Math.min(bundle.defaultCashBuffer, capital);

  const scaledTranches = bundle.buildTranches(capital, cashBuffer);
  const baseCfg = { ...bundle.base, capital, cashBuffer, tranches: scaledTranches };
  const tickers = baseCfg.targets.map((t) => t.ticker);

  const [quotes, regime, signalsAgent, executions, spyCandles, betaResult, ddStats, overlap, vix] = await Promise.all([
    getQuotes(tickers),
    detectRegime(),
    signalAnalysisAgent([...baseCfg.targets]),
    readExecutions(bundle.kind),
    getHistory("SPY", 12),
    computePortfolioBeta(baseCfg.targets.map((t) => ({ ticker: t.ticker, weight: t.weight, tier: t.tier }))),
    Promise.all(tickers.map((t) => computeEtfDrawdownStats(t))),
    bundle.computeEtfOverlap ? computeOverlap(baseCfg.targets).catch(() => null) : Promise.resolve(null),
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
  const dataQualitySkips = quotes
    .filter((q) => q.dataQuality === "invalid" || q.dataQuality === "stale")
    .map((q) => ({ ticker: q.ticker, reason: `DATA INVALID: ${q.qualityReason ?? q.dataQuality}` }));

  const execAgent = executionDecisionAgent(
    allocAgent.output.drift,
    signalsAgent.output,
    effectiveTrancheBudget,
    [...cfg.targets],
    overlap,
    stateAgent.output.portfolioValue,
    {
      applySectorCap: bundle.computeEtfOverlap,
      sleeveCaps: bundle.sleeveCaps,
      roleToSleeve: bundle.roleToSleeve,
      dataQualitySkips,
      capitalAnchor: cfg.capital,
      allowFractionalShares: bundle.allowFractionalShares === true,
      leveragedPolicy: bundle.kind === "fomc" ? {
        regimeKind: regime.kind,
        fomcDayOnly: true,
        // FOMC decision day = Jun 17 2026 in ET. We allow leveraged buys
        // any time on that calendar day (pre-market through after-hours).
        isFomcDay: (() => {
          const fomcEt = new Date("2026-06-17T18:00:00Z"); // 14:00 ET = 18:00 UTC
          const today = new Date();
          // Compare ET dates (offset UTC by −4h for EDT in June).
          const etToday = new Date(today.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const etFomc  = new Date(fomcEt.getTime()  - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
          return etToday === etFomc;
        })(),
      } : undefined,
    },
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
    marketDataAsOf: quotes.length > 0
      ? quotes.reduce((min, q) => (q.asOf < min ? q.asOf : min), quotes[0].asOf)
      : new Date(0).toISOString(),
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
    dataHealth: quotes.map((q) => ({
      ticker: q.ticker,
      dataQuality: q.dataQuality,
      reason: q.qualityReason,
      asOf: q.asOf,
      price: q.price,
      spreadPct: q.spreadPct ?? 0,
      bid: q.bid,
      ask: q.ask,
      avgVolume: q.avgVolume,
    })),
    sleeveExposure: (() => {
      const rows = stateAgent.output.drift;
      const by = new Map<string, { currentUsd: number; targetUsd: number; tickers: string[] }>();
      for (const d of rows) {
        const sl = bundle.roleToSleeve[d.role] ?? "other";
        const r = by.get(sl) ?? { currentUsd: 0, targetUsd: 0, tickers: [] };
        r.currentUsd += d.currentUsd;
        r.targetUsd  += d.targetUsd;
        r.tickers.push(d.ticker);
        by.set(sl, r);
      }
      const pv = stateAgent.output.portfolioValue || cfg.capital;
      return Array.from(by, ([sleeve, r]) => {
        const cap = bundle.sleeveCaps?.[sleeve]?.hardPct ?? null;
        const capDollars = cap != null ? cap * pv : null;
        return {
          sleeve,
          label: bundle.sleeveLabel[sleeve] ?? sleeve,
          currentUsd: r.currentUsd,
          targetUsd:  r.targetUsd,
          capPct: cap,
          capDollars,
          currentPct: pv > 0 ? r.currentUsd / pv : 0,
          targetPct:  pv > 0 ? r.targetUsd  / pv : 0,
          tickers: r.tickers,
          overCap: capDollars != null && r.currentUsd > capDollars + 1e-6,
        };
      });
    })(),
    bundleKind: bundle.kind,
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

  appendSnapshotIfStale(result, bundle.kind).catch(() => {});

  return result;
}
