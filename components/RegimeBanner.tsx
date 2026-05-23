import type { Regime } from "@/types";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Badge } from "@/components/ui/Badge";
import { fmtNum } from "@/lib/format";
import { CheckCircle2, Circle } from "lucide-react";

const variantFor = (k: Regime["kind"]) =>
  k === "rally"      ? "success" :
  k === "correction" ? "danger"  :
  k === "pullback"   ? "info"    : "warn";

export function RegimeBanner({ regime }: { regime: Regime }) {
  const hyst = regime.hysteresis;
  return (
    <CollapsibleCard
      storageKey="card:regime-banner"
      helpSection="regime-banner"
      title="Market regime"
      subtitle="Multi-factor SPY classifier (price, SMA cross, RSI, ADX) with asymmetric hysteresis. Drives the buy-size multiplier."
      right={<Badge variant={variantFor(regime.kind)}>{regime.kind.toUpperCase()} · ×{regime.multiplier}</Badge>}
    >
      <p className="text-sm text-ink/90">{regime.reasoning}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
        <Metric label="SPY price"  value={fmtNum(regime.inputs.spyPrice, 2)} />
        <Metric label="SPY 50d SMA"  value={fmtNum(regime.inputs.spy50, 2)} />
        <Metric label="SPY 200d SMA" value={fmtNum(regime.inputs.spy200, 2)} />
        <Metric label="vs 50d / 200d" value={`${(regime.inputs.pct50 * 100).toFixed(1)}% / ${(regime.inputs.pct200 * 100).toFixed(1)}%`} />
        {Number.isFinite(regime.inputs.rsi14 ?? NaN) && (
          <Metric label="RSI(14)" value={fmtNum(regime.inputs.rsi14 ?? NaN, 1)} />
        )}
        {Number.isFinite(regime.inputs.adx14 ?? NaN) && (
          <Metric label="ADX(14)" value={fmtNum(regime.inputs.adx14 ?? NaN, 1)} />
        )}
        {regime.inputs.smaCrossSeparation !== undefined && (
          <Metric label="50d − 200d (rel)" value={`${(regime.inputs.smaCrossSeparation * 100).toFixed(2)}%`} />
        )}
        {hyst && hyst.pendingKind && (
          <Metric
            label="Pending"
            value={`${hyst.pendingKind} (${hyst.pendingDays}/${hyst.dwellRequired}d)`}
          />
        )}
      </div>

      {regime.factors && regime.factors.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
          <div className="text-[11px] uppercase tracking-wider subtle mb-2">Rally factors</div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
            {regime.factors.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                {f.passed
                  ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  : <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ink-muted" />}
                <div>
                  <span className={f.passed ? "text-emerald-700 dark:text-emerald-300" : "subtle"}>{f.label}</span>
                  {f.detail && <span className="subtle ml-1 font-mono">— {f.detail}</span>}
                </div>
              </li>
            ))}
          </ul>
          {hyst && hyst.rawKind !== hyst.effectiveKind && (
            <div className="mt-2 text-[11px] subtle">
              Raw classification today: <span className="font-medium">{hyst.rawKind}</span>.
              Held at <span className="font-medium">{hyst.effectiveKind}</span> by hysteresis until confirmed.
            </div>
          )}
        </div>
      )}
    </CollapsibleCard>
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
