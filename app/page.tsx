import { runPipeline } from "@/lib/agents";
import { TRANCHES } from "@/config/portfolio";
import type { Tranche } from "@/types";
import { TickerMarquee } from "@/components/TickerMarquee";
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
import { OverlapAnalysis } from "@/components/OverlapAnalysis";
import { EquityCurve } from "@/components/EquityCurve";
import { PortfolioInsights } from "@/components/PortfolioInsights";
import { Card } from "@/components/ui/Card";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  let data;
  try {
    data = await runPipeline();
  } catch (e: any) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <Card className="border-red-500/30">
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
  const currentPhase = data.currentTranche.phase;
  const tranches: Tranche[] = TRANCHES.map((t) => ({
    ...t,
    status: t.phase < currentPhase ? "executed" : t.phase === currentPhase ? "next" : "pending",
  }));

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <TickerMarquee recs={data.recommendations} asOf={data.asOf} />
      <HeroSummary data={data} />
      <RegimeBanner regime={data.regime} />
      <PortfolioInsights data={data} />
      <OverlapAnalysis refreshTick={Math.floor(Date.parse(data.asOf) / 1000)} />
      <EquityCurve refreshTick={Math.floor(Date.parse(data.asOf) / 1000)} />
      <BuyRecommendations recs={data.recommendations} trancheBudget={data.trancheBudget} />

      <AllocationTable rows={data.drift} recommendations={data.recommendations} />
      <ExecutionLog
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
      />
      <AllocationDonut rows={data.drift} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PriceChart tickers={tickers} />
        <DeploymentPlan tranches={tranches} currentBudget={data.trancheBudget} />
      </div>

      <FidelityPanel recs={data.recommendations} />
      <AgentCards agents={data.agents} />

      <footer className="mt-6 p-4 text-xs subtle border-t border-line">
        <strong className="text-ink/80">Educational use only — not investment advice.</strong>{" "}
        Live market data from Yahoo Finance via <code className="kbd">yahoo-finance2</code>. Past performance does
        not guarantee future results. ETFs involve risk, including possible loss of principal. Bond and energy
        ETFs (FBND, FENY) have materially different volatility profiles than broad-market equity ETFs.
      </footer>
    </main>
  );
}
