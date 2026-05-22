import { PORTFOLIO, TRANCHES } from "@/config/portfolio";
import { getQuotes } from "@/lib/yahoo";
import { detectRegime } from "@/lib/regime";
import { aggregateHoldings, readExecutions, totalDeployed, withTrancheStatus } from "@/lib/store";
import { phaseCap } from "@/lib/phaseCap";
import { portfolioStateAgent } from "./portfolioState";
import { allocationStrategyAgent } from "./allocationStrategy";
import { signalAnalysisAgent } from "./signalAnalysis";
import { capitalDeploymentAgent } from "./capitalDeployment";
import { executionDecisionAgent } from "./executionDecision";
import type { PipelineResult } from "@/types";

export async function runPipeline(): Promise<PipelineResult> {
  const baseCfg = PORTFOLIO;
  const tickers = baseCfg.targets.map((t) => t.ticker);

  const [quotes, regime, signalsAgent, executions] = await Promise.all([
    getQuotes(tickers),
    detectRegime(),
    signalAnalysisAgent([...baseCfg.targets]),
    readExecutions(),
  ]);

  const holdings = aggregateHoldings(executions);
  const deployedCash = totalDeployed(executions);
  const tranches = withTrancheStatus(TRANCHES, deployedCash);
  const cap = phaseCap(TRANCHES, executions);
  const cfg = {
    ...baseCfg,
    holdings,
    cash: Math.max(0, baseCfg.capital - deployedCash),
    tranches,
  };

  const stateAgent = portfolioStateAgent(cfg, quotes);
  const allocAgent = allocationStrategyAgent(stateAgent.output.drift, regime);
  const deployAgent = capitalDeploymentAgent(cfg.tranches, cfg.cash, cfg.cashBuffer, regime);
  // Tighten the per-pipeline tranche budget to the phase's actual remaining
  // capacity so recommendations align with the phased cap.
  const effectiveTrancheBudget = Math.min(deployAgent.output.trancheBudget, cap.remainingInPhase || deployAgent.output.trancheBudget);
  const execAgent = executionDecisionAgent(
    allocAgent.output.drift,
    signalsAgent.output,
    effectiveTrancheBudget,
    [...cfg.targets]
  );

  const totalRecommendedUsd = execAgent.output.reduce((s, r) => s + r.dollars, 0);

  return {
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
    recommendations: execAgent.output,
    currentTranche: deployAgent.output.currentTranche,
    trancheBudget: effectiveTrancheBudget,
    totalRecommendedUsd,
    currentPhaseDeployedUsd: cap.consumedInPhase,
    currentPhaseRemainingUsd: cap.remainingInPhase,
    agents: [stateAgent, allocAgent, signalsAgent, deployAgent, execAgent],
  };
}
