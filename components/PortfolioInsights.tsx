import type { PipelineResult } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fmtUsd, fmtPct } from "@/lib/format";

export function PortfolioInsights({ data }: { data: PipelineResult }) {
  const totalUnderweight = data.drift.reduce((s, d) => s + Math.max(0, d.driftUsd), 0);
  const totalOverweight  = data.drift.reduce((s, d) => s + Math.max(0, -d.driftUsd), 0);
  const buyCount   = data.signals.filter((s) => s.signal === "BUY").length;
  const avoidCount = data.signals.filter((s) => s.signal === "AVOID").length;
  const recsTotal  = data.totalRecommendedUsd;
  const utilization = data.trancheBudget > 0 ? recsTotal / data.trancheBudget : 0;
  const tilt = topTilts(data);

  const blendedExpense = data.drift.reduce((s, d) => s + d.targetPct * d.expense, 0);

  const items = [
    { label: "Regime",            value: <Badge variant={
      data.regime.kind === "rally" ? "success" :
      data.regime.kind === "correction" ? "danger" :
      data.regime.kind === "pullback" ? "info" : "warn"
    }>{data.regime.kind.toUpperCase()} ×{data.regime.multiplier}</Badge> },
    { label: "Total underweight", value: fmtUsd(totalUnderweight) },
    { label: "Total overweight",  value: fmtUsd(totalOverweight) },
    { label: "Signals BUY / AVOID", value: `${buyCount} / ${avoidCount}` },
    { label: "Dry powder (after buffer)", value: fmtUsd(Math.max(0, data.cashUsd - data.cashBuffer - recsTotal)) },
    { label: "Tranche utilization", value: `${(utilization * 100).toFixed(0)}% (${fmtUsd(recsTotal)} of ${fmtUsd(data.trancheBudget)})` },
    { label: "Blended expense ratio", value: `${(blendedExpense * 100).toFixed(2)}% / yr` },
    { label: "ETFs in universe", value: String(data.drift.length) },
  ];

  return (
    <Card>
      <CardHeader helpSection="portfolio-insights"
        title="Portfolio insights"
        subtitle="Headline numbers, regime tilts, and dry-powder accounting."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((i) => (
          <div key={i.label} className="rounded-lg bg-surface-2 border border-line px-3 py-2">
            <div className="subtle text-[10px] uppercase tracking-wider">{i.label}</div>
            <div className="mt-1 font-medium text-sm flex items-center gap-2 flex-wrap">{i.value}</div>
          </div>
        ))}
      </div>
      {tilt.length > 0 && (
        <div className="mt-3 text-xs subtle">
          <span className="font-medium text-ink">Top tilts to fill:</span>{" "}
          {tilt.map((t, i) => (
            <span key={t.ticker}>
              <span className="font-mono">{t.ticker}</span> ({fmtPct(t.driftPct, 1)} gap){i < tilt.length - 1 ? " · " : ""}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function topTilts(data: PipelineResult) {
  return data.drift
    .filter((d) => d.driftPct > 0)
    .sort((a, b) => b.driftPct - a.driftPct)
    .slice(0, 4)
    .map((d) => ({ ticker: d.ticker, driftPct: d.driftPct }));
}
