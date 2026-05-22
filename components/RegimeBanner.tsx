import type { Regime } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fmtNum } from "@/lib/format";

const variantFor = (k: Regime["kind"]) =>
  k === "rally"      ? "success" :
  k === "correction" ? "danger"  :
  k === "pullback"   ? "info"    : "warn";

export function RegimeBanner({ regime }: { regime: Regime }) {
  return (
    <Card>
      <CardHeader
        title="Market regime"
        subtitle="Drives the multiplier applied to underweight positions when sizing buys."
        right={<Badge variant={variantFor(regime.kind)}>{regime.kind.toUpperCase()} · ×{regime.multiplier}</Badge>}
      />
      <p className="text-sm text-ink/90">{regime.reasoning}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
        <Metric label="SPY price"  value={fmtNum(regime.inputs.spyPrice, 2)} />
        <Metric label="SPY 50d SMA"  value={fmtNum(regime.inputs.spy50, 2)} />
        <Metric label="SPY 200d SMA" value={fmtNum(regime.inputs.spy200, 2)} />
        <Metric label="vs 50d / 200d" value={`${(regime.inputs.pct50 * 100).toFixed(1)}% / ${(regime.inputs.pct200 * 100).toFixed(1)}%`} />
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 border border-line px-3 py-2">
      <div className="subtle text-[10px] uppercase tracking-wider">{label}</div>
      <div className="font-mono mt-0.5">{value}</div>
    </div>
  );
}
