import { Check, X } from "lucide-react";
import type { GateResult, ScreenerRow } from "@/lib/screener/types";

function GateBlock({ title, gate }: { title: string; gate: GateResult }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-ink">{title}</h4>
        <span className="text-xs font-mono tabular-nums">
          {gate.score.toFixed(1)} / {gate.maxScore}
        </span>
      </div>
      <ul className="space-y-1 text-[11px]">
        {gate.checks.map((c, i) => (
          <li key={i} className="flex items-start gap-1.5">
            {c.ok ? (
              <Check className="w-3 h-3 mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <X className="w-3 h-3 mt-0.5 shrink-0 text-red-500" />
            )}
            <span className={c.ok ? "text-ink/90" : "subtle"}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GateBreakdown({ row }: { row: ScreenerRow }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GateBlock title="Gate 1 — Fundamentals" gate={row.gate1} />
        <GateBlock title="Gate 2 — Moat & Positioning" gate={row.gate2} />
        <GateBlock title="Gate 3 — Market Confirmation" gate={row.gate3} />
      </div>

      <div className="rounded-lg border border-line bg-surface-2/40 p-3">
        <h4 className="text-xs font-semibold text-ink mb-2">Confidence breakdown</h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
          <Component label="Fundamentals" value={row.confidence.components.fundamentals} max={40} />
          <Component label="Moat" value={row.confidence.components.moat} max={25} />
          <Component label="Trend" value={row.confidence.components.trend} max={20} />
          <Component label="Data quality" value={row.confidence.components.dataQuality} max={10} />
          <Component label="Regime" value={row.confidence.components.regime} max={5} signed />
        </div>
        {row.confidence.caveats.length > 0 && (
          <div className="mt-2 pt-2 border-t border-line text-[11px] subtle">
            <strong className="text-amber-700 dark:text-amber-300">Caveats:</strong>{" "}
            {row.confidence.caveats.join(" · ")}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface-2/40 p-3">
        <h4 className="text-xs font-semibold text-ink mb-1">Moat anchor ({row.moatType})</h4>
        <p className="text-[11px] text-ink/80 leading-snug">{row.chokepoint}</p>
      </div>

      {row.error && (
        <div className="rounded-lg border border-red-500/40 bg-red-50/40 dark:bg-red-900/20 p-3 text-[11px] text-red-800 dark:text-red-200">
          Data error: {row.error}
        </div>
      )}
    </div>
  );
}

function Component({
  label, value, max, signed,
}: { label: string; value: number; max: number; signed?: boolean }) {
  const display = signed && value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  return (
    <div className="rounded-md border border-line/60 px-2 py-1.5">
      <div className="text-[10px] subtle uppercase tracking-wide">{label}</div>
      <div className="font-mono tabular-nums">
        <span className="text-sm text-ink">{display}</span>
        <span className="subtle"> / {max}</span>
      </div>
    </div>
  );
}
