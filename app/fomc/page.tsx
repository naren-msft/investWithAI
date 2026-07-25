import { MarketAwareTicker } from "@/components/MarketAwareTicker";
import { HeroSummary } from "@/components/HeroSummary";
import { RegimeBanner } from "@/components/RegimeBanner";
import { BuyRecommendations } from "@/components/BuyRecommendations";
import { AllocationTable } from "@/components/AllocationTable";
import { AllocationDonut } from "@/components/AllocationDonut";
import { PriceChart } from "@/components/PriceChart";
import { DeploymentPlan } from "@/components/DeploymentPlan";
import { AgentCards } from "@/components/AgentCards";
import { ExecutionLog } from "@/components/ExecutionLog";
import { FidelityPanel } from "@/components/FidelityPanel";
import { DividendTracker } from "@/components/DividendTracker";
import { TaxLotTracker } from "@/components/TaxLotTracker";
import { ChangeBanner } from "@/components/ChangeBanner";
import { EquityCurve } from "@/components/EquityCurve";
import { PortfolioInsights } from "@/components/PortfolioInsights";
import { ExposurePanel } from "@/components/ExposurePanel";
import { RiskPanel } from "@/components/RiskPanel";
import { InvalidationWatch } from "@/components/InvalidationWatch";
import { UnderDeploymentSummary } from "@/components/UnderDeploymentSummary";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { NextBestAllocation } from "@/components/NextBestAllocation";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Phase1Tickets } from "@/components/Phase1Tickets";
import { ActiveScenarioToggle } from "@/components/ActiveScenarioToggle";
import { ReturnTargetCard } from "@/components/ReturnTargetCard";
import { DataHealthBanner } from "@/components/DataHealthBanner";
import { WatchlistPanel } from "@/components/WatchlistPanel";
import { IntradayChart } from "@/components/IntradayChart";
import { runPipeline } from "@/lib/agents";
import { fomcBundleFor } from "@/config/fomc";
import { parseScenario, FOMC_SCENARIOS } from "@/config/fomc-scenarios";
import { FOMC_DECISION_AT_ISO, isAfter } from "@/lib/marketTime";
import { Card } from "@/components/ui/Card";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_PREFIX = "/api/fomc";

export default async function FomcPage({
  searchParams,
}: {
  searchParams?: { capital?: string; buffer?: string; scenario?: string };
}) {
  const requestedScenario = parseScenario(searchParams?.scenario);
  // Hard-lock to NEUTRAL until the actual FOMC decision time. Prevents URL
  // tampering or stale bookmarks from executing Phase 1 against the wrong
  // weight column.
  const scenario = isAfter(FOMC_DECISION_AT_ISO) ? requestedScenario : "neutral";
  const scenarioMeta = FOMC_SCENARIOS[scenario];

  const capitalParam = Number(searchParams?.capital);
  const bufferParam = Number(searchParams?.buffer);
  const overrides = {
    bundle: fomcBundleFor(scenario),
    capital: Number.isFinite(capitalParam) && capitalParam > 0 ? capitalParam : undefined,
    cashBuffer: Number.isFinite(bufferParam) && bufferParam >= 0 ? bufferParam : undefined,
  };

  let data;
  try {
    data = await runPipeline(overrides);
  } catch (e: any) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <DashboardHeader label={`FOMC Playbook · ${scenarioMeta.shortLabel}`} />
        <Card className="border-red-500/30 mt-3">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4" />
            <h2 className="font-semibold">Failed to load market data</h2>
          </div>
          <p className="text-sm subtle mt-2">{String(e?.message ?? e)}</p>
          <p className="text-xs subtle mt-2">
            This dashboard fetches live data from Yahoo Finance. Check your internet connection, then refresh.
          </p>
        </Card>
      </main>
    );
  }

  const tickers = data.drift.map((d) => d.ticker);
  const refreshTick = Math.floor(Date.parse(data.asOf) / 1000);

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <DashboardHeader label={`FOMC June-17 Playbook · ${scenarioMeta.shortLabel}`} />
      <MarketAwareTicker recs={data.recommendations} asOf={data.asOf} />
      <ChangeBanner refreshTick={refreshTick} apiPrefix={API_PREFIX} />

      <HeroSummary
        data={data}
        title={`FOMC June-17 Playbook · ${scenarioMeta.label}`}
        subtitle={`$700K deployment across ${data.drift.length} tickers · 4-phase schedule keyed to FOMC date + NVDA earnings + Q4 reserve. Switch the scenario below to pivot weights.`}
        scope="stocks"
      />

      <ActiveScenarioToggle active={scenario} />
      <ReturnTargetCard data={data} scenario={scenario} />

      <DataHealthBanner data={data} />

      <RegimeBanner regime={data.regime} />
      <Phase1Tickets data={data} />
      <IntradayChart ticker="SPY" interval="5m" range="5d" />
      <WatchlistPanel />
      <PortfolioInsights data={data} universeLabel="FOMC universe" />
      <UnderDeploymentSummary data={data} assetNoun="ticker" />
      <NextBestAllocation data={data} />
      <ExposurePanel data={data} />
      <RiskPanel data={data} />
      <InvalidationWatch refreshTick={refreshTick} apiPrefix={API_PREFIX} />
      <ScenarioPanel data={data} />
      <EquityCurve refreshTick={refreshTick} apiPrefix={API_PREFIX} />
      <DividendTracker refreshTick={refreshTick} apiPrefix={API_PREFIX} />
      <TaxLotTracker refreshTick={refreshTick} apiPrefix={API_PREFIX} />
      <BuyRecommendations
        recs={data.recommendations}
        trancheBudget={data.trancheBudget}
        skipped={data.skippedBuys}
        phaseReady={data.phaseReady}
        lockedReason={data.phaseLockedReason}
        assetNoun="ticker"
      />

      <AllocationTable rows={data.drift} recommendations={data.recommendations} detailBase="/fomc" />
      <ExecutionLog
        apiPrefix={API_PREFIX}
        tickers={data.drift.map((d) => {
          const rec = data.recommendations.find((r) => r.ticker === d.ticker);
          return { ticker: d.ticker, price: d.price, name: d.name, recShares: rec?.shares, recDollars: rec?.dollars };
        })}
        currentPhase={data.currentTranche.phase}
        phaseSize={data.currentTranche.size}
        phaseDeployed={data.currentPhaseDeployedUsd}
        phaseRemaining={data.currentPhaseRemainingUsd}
        capital={data.capital}
        totalDeployed={data.deployedUsd}
        phaseReady={data.phaseReady}
        lockedReason={data.phaseLockedReason}
      />
      <AllocationDonut rows={data.drift} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PriceChart tickers={tickers} />
        <DeploymentPlan
          gates={data.phaseGates}
          anchor={data.phaseAnchor}
          currentBudget={data.trancheBudget}
          regimeKind={data.regime.kind}
        />
      </div>

      <FidelityPanel recs={data.recommendations} />
      <AgentCards agents={data.agents} />

      <footer className="mt-6 p-4 text-xs subtle border-t border-line">
        <strong className="text-ink/80">Educational use only — not investment advice.</strong>{" "}
        Live market data from Yahoo Finance via <code className="kbd">yahoo-finance2</code>.
        The FOMC playbook scenarios are illustrative weight columns; the user controls which one
        is "active" via the toggle above. Past performance does not guarantee future results.
        Quantum and crypto positions can lose 70–90% in a downturn.
      </footer>
    </main>
  );
}
