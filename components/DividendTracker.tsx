"use client";

import { useEffect, useState } from "react";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Badge } from "@/components/ui/Badge";
import { fmtUsd } from "@/lib/format";
import { Calendar, DollarSign, Loader2 } from "lucide-react";

interface IncomeRow {
  ticker: string;
  name: string;
  role: string;
  shares: number;
  yieldPct: number;
  annualRate: number;
  projectedAnnualIncome: number;
  exDividendDate?: string;
  lastDividendValue?: number;
}

interface IncomeReport {
  rows: IncomeRow[];
  totalProjectedAnnual: number;
  blendedYield: number;
  upcoming: IncomeRow[];
}

export function DividendTracker({ refreshTick, apiPrefix = "/api" }: { refreshTick?: number; apiPrefix?: string }) {
  const [data, setData] = useState<IncomeReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${apiPrefix}/dividends`)
      .then((r) => r.json())
      .then((j) => alive && setData(j))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [refreshTick]);

  if (loading) {
    return (
      <CollapsibleCard
        storageKey="card:dividend-tracker"
        defaultCollapsed
        helpSection="dividend-tracker"
        title="Dividend tracker"
        subtitle="Projected annual income from your held shares + upcoming ex-dividend dates."
      >
        <div className="h-[80px] grid place-items-center subtle text-sm">
          <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Fetching dividend data…</span>
        </div>
      </CollapsibleCard>
    );
  }
  if (!data) return null;

  const heldRows = data.rows.filter((r) => r.shares > 0);
  const monthly = data.totalProjectedAnnual / 12;

  return (
    <CollapsibleCard
      storageKey="card:dividend-tracker"
      defaultCollapsed
      helpSection="dividend-tracker"
      title="Dividend tracker"
      subtitle="Annual income at current shares + blended yield + upcoming ex-dividend dates."
      right={
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="info">Blended yield {(data.blendedYield * 100).toFixed(2)}%</Badge>
          <Badge variant="success">
            <DollarSign className="w-3 h-3 mr-0.5" />
            {fmtUsd(data.totalProjectedAnnual)} / yr
          </Badge>
        </div>
      }
    >
      {/* Summary cells */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Annual income (est)"  value={fmtUsd(data.totalProjectedAnnual)} tone={data.totalProjectedAnnual > 0 ? "gain" : undefined} />
            <Stat label="Monthly avg"          value={fmtUsd(monthly)} />
            <Stat label="Blended yield"        value={`${(data.blendedYield * 100).toFixed(2)}%`} />
            <Stat label="Holdings paying"      value={`${heldRows.filter((r) => r.annualRate > 0).length} of ${data.rows.length}`} />
          </div>

          {/* Per-symbol table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left subtle text-[11px] uppercase tracking-wider">
                  <th className="py-2 pr-3">Ticker</th>
                  <th className="py-2 pr-3 text-right">Shares</th>
                  <th className="py-2 pr-3 text-right">Yield</th>
                  <th className="py-2 pr-3 text-right">$ / share / yr</th>
                  <th className="py-2 pr-3 text-right">Est. annual income</th>
                  <th className="py-2 pr-3"><Calendar className="w-3 h-3 inline mr-1" />Next ex-date</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.ticker} className="border-t border-line">
                    <td className="py-2 pr-3 font-medium" title={r.name}>{r.ticker}</td>
                    <td className="py-2 pr-3 text-right font-mono">{r.shares}</td>
                    <td className="py-2 pr-3 text-right font-mono">{r.yieldPct > 0 ? `${(r.yieldPct * 100).toFixed(2)}%` : <span className="subtle">—</span>}</td>
                    <td className="py-2 pr-3 text-right font-mono">{r.annualRate > 0 ? `$${r.annualRate.toFixed(2)}` : <span className="subtle">—</span>}</td>
                    <td className={`py-2 pr-3 text-right font-mono ${r.projectedAnnualIncome > 0 ? "text-emerald-700 dark:text-emerald-300" : "subtle"}`}>
                      {r.projectedAnnualIncome > 0 ? fmtUsd(r.projectedAnnualIncome) : "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono subtle">{r.exDividendDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
    </CollapsibleCard>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  const cls = tone === "gain" ? "text-emerald-700 dark:text-emerald-300" : tone === "loss" ? "text-red-700 dark:text-red-300" : "";
  return (
    <div className="rounded-lg bg-surface-2 border border-line px-3 py-2">
      <div className="subtle text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-mono text-sm ${cls}`}>{value}</div>
    </div>
  );
}
