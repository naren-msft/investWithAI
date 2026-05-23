import type { AgentResult } from "@/types";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
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
  PortfolioStateAgent:    "Reads current holdings, prices, computes drift vs targets.",
  AllocationStrategyAgent:"Applies regime multiplier to underweights, normalizes effective weights.",
  SignalAnalysisAgent:    "Per-symbol RSI-14 + MACD(12,26,9); emits BUY / HOLD / AVOID.",
  CapitalDeploymentAgent: "Sizes the next tranche from cash − buffer × regime, capped at phase remaining.",
  ExecutionDecisionAgent: "Joins drift × signal × tranche → concrete BUY tickets.",
};

// Per-agent tint using the requested palette (red, green, blue, yellow). With 5
// agents I cycle so each pipeline stage has a distinct light-tinted background
// that works in both light and dark mode.
type Tone = "blue" | "yellow" | "green" | "red" | "indigo";
const TONES: Record<string, Tone> = {
  PortfolioStateAgent:    "blue",
  AllocationStrategyAgent:"yellow",
  SignalAnalysisAgent:    "green",
  CapitalDeploymentAgent: "red",
  ExecutionDecisionAgent: "indigo",
};
const TONE_BG: Record<Tone, string> = {
  blue:   "bg-blue-100   dark:bg-blue-950/40    border-blue-300/60   dark:border-blue-800/60",
  yellow: "bg-yellow-100 dark:bg-yellow-950/40  border-yellow-300/60 dark:border-yellow-800/60",
  green:  "bg-green-100  dark:bg-green-950/40   border-green-300/60  dark:border-green-800/60",
  red:    "bg-red-100    dark:bg-red-950/40     border-red-300/60    dark:border-red-800/60",
  indigo: "bg-indigo-100 dark:bg-indigo-950/40  border-indigo-300/60 dark:border-indigo-800/60",
};
const TONE_ICON: Record<Tone, string> = {
  blue:   "bg-blue-200/70   text-blue-800   dark:bg-blue-900/60  dark:text-blue-200",
  yellow: "bg-yellow-200/70 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-200",
  green:  "bg-green-200/70  text-green-800  dark:bg-green-900/60  dark:text-green-200",
  red:    "bg-red-200/70    text-red-800    dark:bg-red-900/60    dark:text-red-200",
  indigo: "bg-indigo-200/70 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200",
};
const TONE_TEXT: Record<Tone, string> = {
  blue:   "text-blue-900   dark:text-blue-100",
  yellow: "text-yellow-900 dark:text-yellow-100",
  green:  "text-green-900  dark:text-green-100",
  red:    "text-red-900    dark:text-red-100",
  indigo: "text-indigo-900 dark:text-indigo-100",
};

export function AgentCards({ agents }: { agents: AgentResult[] }) {
  return (
    <CollapsibleCard
      storageKey="card:agent-cards"
      helpSection="agent-cards"
      title="Agent pipeline"
      subtitle="Five deterministic agents cooperate; each card shows its reasoning trace."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {agents.map((a, i) => {
          const tone: Tone = TONES[a.agent] ?? "blue";
          return (
            <div key={a.agent} className={`rounded-xl border p-4 flex flex-col ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-md grid place-items-center ${TONE_ICON[tone]}`}>{ICONS[a.agent]}</div>
                <div className="font-semibold text-sm">{i + 1}. {a.agent.replace(/Agent$/, "")}</div>
              </div>
              <p className="text-[11px] opacity-80 mb-2">{PURPOSE[a.agent]}</p>
              <p className="text-xs leading-relaxed">{a.reasoning}</p>
              <div className="mt-auto pt-3">
                <Badge variant="default">Step {i + 1} / {agents.length}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </CollapsibleCard>
  );
}
