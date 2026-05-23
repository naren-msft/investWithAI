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
import { UnderDeploymentSummary } from "@/components/UnderDeploymentSummary";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { NextBestAllocation } from "@/components/NextBestAllocation";
import { DashboardHeader } from "@/components/DashboardHeader";
import { runPipeline } from "@/lib/agents";
import { stocksBundle } from "@/config/stocks";
import { Card } from "@/components/ui/Card";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_PREFIX = "/api/stocks";

export default async function StocksPage({
  searchParams,
}: {
  searchParams?: { capital?: string; buffer?: string };
}) {
  const capitalParam = Number(searchParams?.capital);
  const bufferParam = Number(searchParams?.buffer);
  const overrides = {
    bundle: stocksBundle,
    capital: Number.isFinite(capitalParam) && capitalParam > 0 ? capitalParam : undefined,
    cashBuffer: Number.isFinite(bufferParam) && bufferParam >= 0 ? bufferParam : undefined,
  };

  let data;
  try {
    data = await runPipeline(overrides);
  } catch (e: any) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <DashboardHeader label="Stock Portfolio" />
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
      <DashboardHeader label="Stock Portfolio" />
      <MarketAwareTicker recs={data.recommendations} asOf={data.asOf} />
      <ChangeBanner refreshTick={refreshTick} apiPrefix={API_PREFIX} />
      <HeroSummary data={data} title="Stocks Portfolio · Fidelity" subtitle={`Multi-agent allocation across ${data.drift.length} stocks, tier-aware signals, staged deployment.`} />
      <RegimeBanner regime={data.regime} />
      <PortfolioInsights data={data} />
      <UnderDeploymentSummary data={data} />
      <NextBestAllocation data={data} />
      <ExposurePanel data={data} />
      <RiskPanel data={data} />
      <ScenarioPanel data={data} />
      <EquityCurve refreshTick={refreshTick} apiPrefix={API_PREFIX} />
      <DividendTracker refreshTick={refreshTick} apiPrefix={API_PREFIX} />
      <TaxLotTracker  refreshTick={refreshTick} apiPrefix={API_PREFIX} />
      <BuyRecommendations recs={data.recommendations} trancheBudget={data.trancheBudget} skipped={data.skippedBuys} phaseReady={data.phaseReady} lockedReason={data.phaseLockedReason} />

      <AllocationTable rows={data.drift} recommendations={data.recommendations} detailBase="/stocks" />
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
        Live market data from Yahoo Finance via <code className="kbd">yahoo-finance2</code>. Past performance does
        not guarantee future results. Individual stocks (especially small-cap and pre-revenue speculative names)
        involve substantially higher risk than diversified ETFs, including total loss of principal.
      </footer>
    </main>
  );
}
