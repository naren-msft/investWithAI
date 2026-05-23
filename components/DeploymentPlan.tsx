import type { PhaseGateState, PipelineResult, TrancheTriggers } from "@/types";
import { TRANCHES } from "@/config/portfolio";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { fmtUsd } from "@/lib/format";
import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";

type Anchor = PipelineResult["phaseAnchor"];

export function DeploymentPlan({
  gates,
  anchor,
  currentBudget,
  regimeKind,
}: {
  gates: PhaseGateState[];
  anchor: Anchor;
  currentBudget: number;
  regimeKind: string;
}) {
  const trancheByPhase = new Map(TRANCHES.map((t) => [t.phase, t]));

  const p5 = gates.find((g) => g.phase === 5);
  const p5Note = p5 ? `P5 = ${fmtUsd(p5.size)} cash buffer release. ` : "";
  const anchorSummary = `${anchor.daysSinceStart}d since P1 · SPY ${anchor.spyDrawdownFromPeak > 0 ? "−" : ""}${(anchor.spyDrawdownFromPeak * 100).toFixed(2)}% from peak · max DD seen −${(anchor.maxDrawdownSinceAnchor * 100).toFixed(2)}%`;

  return (
    <Card>
      <CardHeader
        helpSection="deployment-plan"
        title="Staged capital deployment"
        subtitle={`5-phase plan gated by time, SPY drawdown, and trend confirmation. ${p5Note}· ${anchorSummary}`}
        right={<Badge variant="info">Next budget {fmtUsd(currentBudget)}</Badge>}
      />
      <div className="space-y-2">
        {gates.map((g) => {
          const cfg = trancheByPhase.get(g.phase);
          return (
            <PhaseRow
              key={g.phase}
              gate={g}
              triggers={cfg?.triggers ?? {}}
              anchor={anchor}
              regimeKind={regimeKind}
            />
          );
        })}
      </div>
    </Card>
  );
}

function PhaseRow({
  gate,
  triggers,
  anchor,
  regimeKind,
}: {
  gate: PhaseGateState;
  triggers: TrancheTriggers;
  anchor: Anchor;
  regimeKind: string;
}) {
  const conditions = buildConditions(gate, triggers, anchor, regimeKind);
  const fill = gate.size > 0 ? gate.consumedInPhase / gate.size : 0;
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-sm">P{gate.phase}</span>
          <span className="font-mono text-sm">{fmtUsd(gate.size)}</span>
          <StatusBadge status={gate.status} />
        </div>
        <div className="text-[11px] font-mono subtle">
          {fmtUsd(gate.consumedInPhase)} / {fmtUsd(gate.size)} deployed
        </div>
      </div>

      <ul className="space-y-1 mb-2">
        {conditions.map((c, i) => (
          <li key={i} className="flex items-center gap-2 text-[12px]">
            <ConditionIcon state={c.state} />
            <span className={c.state === "met" ? "text-emerald-700 dark:text-emerald-300" : "subtle"}>
              {c.label}
            </span>
            {c.detail && <span className="subtle text-[11px]">— {c.detail}</span>}
          </li>
        ))}
        {conditions.length > 1 && (
          <li className="text-[10px] subtle italic">Any one trigger unlocks this phase.</li>
        )}
      </ul>

      {gate.consumedInPhase > 0 && (
        <ProgressBar value={gate.consumedInPhase} max={Math.max(gate.size, gate.consumedInPhase, 1)} tone="brand" />
      )}
    </div>
  );
}

interface Condition {
  label: string;
  detail?: string;
  state: "met" | "pending" | "failed";
}

function buildConditions(
  gate: PhaseGateState,
  triggers: TrancheTriggers,
  anchor: Anchor,
  regimeKind: string,
): Condition[] {
  const out: Condition[] = [];

  if (typeof triggers.daysFromStart === "number") {
    const need = triggers.daysFromStart;
    const have = anchor.daysSinceStart;
    out.push({
      label: need === 0 ? "Start immediately" : `${need} days elapsed`,
      detail: need === 0 ? undefined : `${have} of ${need} days`,
      state: have >= need ? "met" : "pending",
    });
  }

  if (typeof triggers.spyDrawdownPct === "number") {
    const need = triggers.spyDrawdownPct;
    const have = anchor.spyDrawdownFromPeak;
    out.push({
      label: `SPY −${(need * 100).toFixed(0)}% from anchor peak`,
      detail: `currently −${(have * 100).toFixed(2)}%`,
      state: have + 1e-9 >= need ? "met" : "pending",
    });
  }

  if (triggers.trendConfirmation) {
    const PULLBACK_THRESHOLD = 0.05;
    const hadPullback = anchor.maxDrawdownSinceAnchor + 1e-9 >= PULLBACK_THRESHOLD;
    const inRally = regimeKind === "rally";
    out.push({
      label: `Pullback detected (≥5% drawdown)`,
      detail: `max DD seen −${(anchor.maxDrawdownSinceAnchor * 100).toFixed(2)}%`,
      state: hadPullback ? "met" : "pending",
    });
    out.push({
      label: `Recovery confirmed (regime = rally)`,
      detail: `currently ${regimeKind}`,
      state: inRally && hadPullback ? "met" : hadPullback ? "pending" : "pending",
    });
  }

  return out;
}

function ConditionIcon({ state }: { state: Condition["state"] }) {
  if (state === "met") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
  if (state === "failed") return <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />;
  return <Clock className="w-3.5 h-3.5 text-ink-muted" />;
}

function StatusBadge({ status }: { status: PhaseGateState["status"] }) {
  switch (status) {
    case "executed": return <Badge variant="info">executed</Badge>;
    case "filled":   return <Badge variant="info">filled</Badge>;
    case "ready":    return <Badge variant="success">ready</Badge>;
    case "locked":   return <Badge variant="default">locked</Badge>;
  }
}
