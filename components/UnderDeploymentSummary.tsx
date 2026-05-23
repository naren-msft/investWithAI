import type { PipelineResult, SkippedBuyCode } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fmtUsd } from "@/lib/format";

// Dashboard-level explanation of WHY the next tranche isn't fully deployed.
// Answers the reviewer's #1 ask: "$X unallocated. Reasons:" — built off the
// pipeline's structured `skipped` diagnostics and `sizing` breakdown so the
// numbers stay consistent with RiskPanel / Regime / AgentCards.

const CODE_LABEL: Record<SkippedBuyCode, string> = {
  "avoid-rsi":             "AVOID signal (overbought)",
  "rsi-overbought":        "RSI ≥ 70 — overbought gate",
  "not-underweight":       "Not underweight",
  "drift-tiny":            "Drift below $1k floor",
  "sector-cap-hard":       "Sector hard cap (35%)",
  "sector-cap-soft-zero":  "Sector soft cap shrank to < 1 share",
  "tranche-zero":          "Tranche $0 (phase locked / vol-cap)",
  "fractional-share":      "Position too small for one share",
  "position-cap":          "Per-name position cap reached",
  "sleeve-cap":            "Themed sleeve cap reached",
  "insufficient-data":     "Insufficient price history",
  "other":                 "Other",
};

export function UnderDeploymentSummary({ data }: { data: PipelineResult }) {
  const { sizing, trancheBudget, totalRecommendedUsd, skippedBuys } = data;
  const unallocated = Math.max(0, trancheBudget - totalRecommendedUsd);
  const utilization = trancheBudget > 0 ? totalRecommendedUsd / trancheBudget : 0;

  // Group skipped tickers by reason code.
  const byCode = new Map<SkippedBuyCode, string[]>();
  for (const s of skippedBuys) {
    const arr = byCode.get(s.code) ?? [];
    arr.push(s.ticker);
    byCode.set(s.code, arr);
  }
  const grouped = [...byCode.entries()].sort((a, b) => b[1].length - a[1].length);

  // Caps that bound the tranche size — drives the "why is the tranche so
  // small / zero" explanation at the top.
  const sizingReasons = sizingExplain(data);

  return (
    <Card>
      <CardHeader
        helpSection="under-deployment"
        title="Under-deployment explained"
        subtitle="Why isn't every dollar working? Tranche sizing + per-ETF blocking reasons at a glance."
        right={
          <Badge variant={unallocated > 0 ? "warn" : "success"}>
            {unallocated > 0
              ? `${fmtUsd(unallocated)} unallocated`
              : "Tranche fully allocated"}
          </Badge>
        }
      />

      {/* Numeric breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Tile label="Tranche budget"  value={fmtUsd(trancheBudget)} />
        <Tile label="Recommended"     value={fmtUsd(totalRecommendedUsd)} sub={`${(utilization * 100).toFixed(1)}% of tranche`} />
        <Tile label="Unallocated"     value={fmtUsd(unallocated)} tone={unallocated > 0 ? "warn" : "muted"} />
        <Tile
          label="Final multiplier"
          value={`${sizing.finalMultiplier.toFixed(2)}×`}
          sub={`base ${fmtUsd(sizing.baseTranche)} · caps: ${sizing.capsApplied.join(", ")}`}
        />
      </div>

      {/* Sizing explanation */}
      <div className="rounded-lg border border-line bg-surface-2 p-3 mb-4 text-xs">
        <div className="font-medium mb-1.5">Why is the tranche size this number?</div>
        <ul className="space-y-1 leading-relaxed">
          {sizingReasons.map((line, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="text-ink-muted">•</span>
              <span className="subtle"><span className="text-ink">{line.label}:</span> {line.detail}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Per-ticker skip reasons */}
      {grouped.length > 0 && (
        <div className="rounded-lg border border-line bg-surface-2 p-3 text-xs">
          <div className="font-medium mb-2">
            Per-ETF blocking reasons ({skippedBuys.length} excluded)
          </div>
          <ul className="space-y-1.5">
            {grouped.map(([code, tickers]) => (
              <li key={code} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink min-w-[14ch]">{CODE_LABEL[code]}</span>
                <span className="subtle font-mono">{tickers.join(" · ")}</span>
                <span className="subtle">({tickers.length})</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[10px] subtle">
            See the <span className="font-medium">Top buy recommendations</span> and{" "}
            <span className="font-medium">Allocation table</span> for per-ticker numbers.
          </div>
        </div>
      )}
    </Card>
  );
}

function Tile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warn" | "muted";
}) {
  const valueClass =
    tone === "warn"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "muted"
        ? "text-ink-muted"
        : "text-ink";
  return (
    <div className="rounded-lg bg-surface-3 border border-line px-3 py-2">
      <div className="subtle text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-semibold text-base font-mono ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] subtle mt-0.5">{sub}</div>}
    </div>
  );
}

function sizingExplain(data: PipelineResult): { label: string; detail: string }[] {
  const { sizing, phaseReady, phaseLockedReason } = data;
  const lines: { label: string; detail: string }[] = [];

  if (!phaseReady) {
    lines.push({
      label: "Phase locked",
      detail: phaseLockedReason ?? "Current phase is not yet ready.",
    });
    return lines;
  }

  lines.push({
    label: `Base tranche (Phase ${data.currentTranche.phase})`,
    detail: `${fmtUsd(sizing.baseTranche)} nominal.`,
  });
  lines.push({
    label: `Regime multiplier ${sizing.regimeMultiplier}×`,
    detail: `${data.regime.kind} regime.`,
  });
  if (sizing.betaThrottle.multiplier < 1) {
    lines.push({
      label: `β-throttle ${sizing.betaThrottle.multiplier}×`,
      detail: sizing.betaThrottle.reason,
    });
  } else {
    lines.push({
      label: "β-throttle",
      detail: sizing.betaThrottle.reason,
    });
  }
  lines.push({
    label: `Vol cap ${sizing.volGate.cap}× (VIX ${Number.isFinite(sizing.volGate.vix) ? sizing.volGate.vix.toFixed(1) : "—"} · ${sizing.volGate.level})`,
    detail: sizing.volGate.reason,
  });
  if (sizing.concentrationThrottle.multiplier < 1) {
    lines.push({
      label: `HHI throttle ${sizing.concentrationThrottle.multiplier}× (${sizing.concentrationThrottle.level})`,
      detail: sizing.concentrationThrottle.reason,
    });
  } else {
    lines.push({
      label: "HHI throttle",
      detail: sizing.concentrationThrottle.reason,
    });
  }
  if (sizing.headroomCap < sizing.preCap - 1e-6) {
    lines.push({
      label: "Phase headroom",
      detail: `Only ${fmtUsd(sizing.headroomCap)} left in this phase — pre-cap was ${fmtUsd(sizing.preCap)}.`,
    });
  }
  if (sizing.deployableCash < sizing.preCap - 1e-6 && sizing.deployableCash < sizing.headroomCap - 1e-6) {
    lines.push({
      label: "Deployable cash",
      detail: `Only ${fmtUsd(sizing.deployableCash)} of cash above the reserved buffer is available.`,
    });
  }
  lines.push({
    label: "Final tranche",
    detail: `${fmtUsd(sizing.finalDollars)} = ${sizing.finalMultiplier.toFixed(2)}× base. Caps applied: ${sizing.capsApplied.join(", ")}.`,
  });
  return lines;
}
