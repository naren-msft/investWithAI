import type { AgentResult } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Activity, Compass, LineChart, Wallet, CheckCircle2 } from "lucide-react";

const ICONS: Record<string, React.ReactNode> = {
  PortfolioStateAgent:    <Compass className="w-4 h-4" />,
  AllocationStrategyAgent:<Activity className="w-4 h-4" />,
  SignalAnalysisAgent:    <LineChart className="w-4 h-4" />,
  CapitalDeploymentAgent: <Wallet className="w-4 h-4" />,
  ExecutionDecisionAgent: <CheckCircle2 className="w-4 h-4" />,
};

const PURPOSE: Record<string, string> = {
  PortfolioStateAgent:    "Reads current holdings, prices, computes drift vs regime-adjusted targets.",
  AllocationStrategyAgent:"Applies regime multiplier and prioritizes underweight positions.",
  SignalAnalysisAgent:    "Per-ETF RSI-14 + MACD(12,26,9); emits BUY / HOLD / AVOID.",
  CapitalDeploymentAgent: "Sizes the next tranche from available cash × regime multiplier.",
  ExecutionDecisionAgent: "Joins drift × signal × tranche → concrete BUY tickets, BUY-weighted 2×.",
};

export function AgentCards({ agents }: { agents: AgentResult[] }) {
  return (
    <Card>
      <CardHeader
        title="Agent pipeline"
        subtitle="Five deterministic agents cooperate; each card shows its reasoning trace."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {agents.map((a, i) => (
          <div key={a.agent} className="rounded-xl border border-line bg-surface-2 p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-md bg-surface-3 grid place-items-center">{ICONS[a.agent]}</div>
              <div className="font-semibold text-sm">{i + 1}. {a.agent.replace(/Agent$/, "")}</div>
            </div>
            <p className="text-[11px] subtle mb-2">{PURPOSE[a.agent]}</p>
            <p className="text-xs text-ink/90 leading-relaxed">{a.reasoning}</p>
            <div className="mt-auto pt-3">
              <Badge variant="default">Step {i + 1} / {agents.length}</Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
