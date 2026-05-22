import Link from "next/link";
import type { BuyRecommendation, DriftRow } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { fmtPct, fmtUsd } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight, Minus, AlertCircle } from "lucide-react";

export function AllocationTable({
  rows,
  recommendations,
}: {
  rows: DriftRow[];
  recommendations: BuyRecommendation[];
}) {
  const sorted = [...rows].sort((a, b) => b.targetPct - a.targetPct);
  const recByTicker = new Map(recommendations.map((r) => [r.ticker, r]));
  return (
    <Card>
      <CardHeader helpSection="allocation-table"
        title="Allocation table"
        subtitle="Today = live intraday % change.  Drift = target $ − current $.  Buy this tranche = dollars to deploy now.  Δ after buys = drift remaining.  ⚠️ = drift > 3% (rebalance candidate).  Click ticker for full research page."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left subtle text-[11px] uppercase tracking-wider">
              <th className="py-2 pr-3">Ticker</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3 text-right" title="Expense ratio — annual fee charged by the fund.">ER</th>
              <th className="py-2 pr-3 text-right">Today</th>
              <th className="py-2 pr-3 text-right">Price</th>
              <th className="py-2 pr-3 text-right">Target</th>
              <th className="py-2 pr-3 text-right">Current</th>
              <th className="py-2 pr-3 text-right">Target $</th>
              <th className="py-2 pr-3 text-right">Current $</th>
              <th className="py-2 pr-3 text-right">Drift $</th>
              <th className="py-2 pr-3 text-right" title="Dollars the Execution Agent will deploy into this ETF in the current tranche.">
                Buy this tranche
              </th>
              <th className="py-2 pr-3 text-right" title="Drift remaining after the recommended buy executes.">
                Δ after buys
              </th>
              <th className="py-2 pl-3 w-40">Fill</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const rec = recByTicker.get(r.ticker);
              const recDollars = rec?.dollars ?? 0;
              const afterDrift = r.driftUsd - recDollars;
              const fillPct = r.targetUsd > 0 ? Math.min(100, ((r.currentUsd + recDollars) / r.targetUsd) * 100) : 0;
              return (
                <tr key={r.ticker} className="border-t border-line">
                  <td className="py-2 pr-3 font-medium" title={r.name}>
                    <Link href={`/etf/${r.ticker}`} className="hover:underline">{r.ticker}</Link>
                    {Math.abs(r.driftPct) > 0.03 && (
                      <AlertCircle className="inline-block w-3 h-3 ml-1 text-amber-700 dark:text-amber-300" />
                    )}
                  </td>
                  <td className="py-2 pr-3 subtle truncate max-w-[200px]" title={r.name}>{r.role}</td>
                  <td className="py-2 pr-3 text-right font-mono subtle">{(r.expense * 100).toFixed(2)}%</td>
                  <td className="py-2 pr-3 text-right"><DayChange pct={r.dayChangePct} /></td>
                  <td className="py-2 pr-3 text-right font-mono">${r.price.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{fmtPct(r.targetPct)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{fmtPct(r.currentPct)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{fmtUsd(r.targetUsd)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{fmtUsd(r.currentUsd)}</td>
                  <td
                    className={`py-2 pr-3 text-right font-mono ${
                      r.driftUsd > 0 ? "text-emerald-700 dark:text-emerald-300"
                      : r.driftUsd < 0 ? "text-amber-700 dark:text-amber-300" : "subtle"
                    }`}
                  >
                    {fmtUsd(r.driftUsd, true)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {recDollars > 0 ? fmtUsd(recDollars) : <span className="subtle">—</span>}
                  </td>
                  <td className={`py-2 pr-3 text-right font-mono ${
                    Math.abs(afterDrift) < 1000 ? "text-emerald-700 dark:text-emerald-300" : "subtle"
                  }`}>
                    {fmtUsd(afterDrift, true)}
                  </td>
                  <td className="py-2 pl-3">
                    <ProgressBar value={r.currentUsd + recDollars} max={r.targetUsd} />
                    <div className="mt-1 text-[10px] subtle font-mono">{fillPct.toFixed(0)}% filled after buys</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function DayChange({ pct, size = "md" }: { pct: number; size?: "sm" | "md" }) {
  const isUp = pct > 0.005;
  const isDown = pct < -0.005;
  const cls = isUp
    ? "text-emerald-700 dark:text-emerald-300"
    : isDown
    ? "text-red-700 dark:text-red-300"
    : "subtle";
  const Icon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus;
  const px = size === "sm" ? "text-[11px]" : "text-sm";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <span className={`inline-flex items-center justify-end gap-0.5 font-mono ${cls} ${px}`}>
      <Icon className={iconSize} />
      {Number.isFinite(pct) ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
    </span>
  );
}
