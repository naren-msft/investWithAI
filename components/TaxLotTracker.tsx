"use client";

import { useEffect, useState } from "react";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Badge } from "@/components/ui/Badge";
import { fmtUsd } from "@/lib/format";
import { AlertTriangle, Calendar, Loader2 } from "lucide-react";

interface TaxLot {
  id: string;
  ticker: string;
  shares: number;
  price: number;
  date: string;
  note?: string;
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  daysHeld: number;
  isLongTerm: boolean;
  daysUntilLT: number;
  isTLHCandidate: boolean;
}

interface TaxReport {
  lots: TaxLot[];
  totals: {
    costBasis: number; marketValue: number; unrealizedGain: number; unrealizedGainPct: number;
    unrealizedSTCG: number; unrealizedLTCG: number; unrealizedLoss: number;
    tlhOpportunity: number; stcgTaxEstSavingsIfHeld: number;
  };
  topTLHCandidates: TaxLot[];
  approachingLT: TaxLot[];
}

export function TaxLotTracker({ refreshTick, apiPrefix = "/api" }: { refreshTick?: number; apiPrefix?: string }) {
  const [data, setData] = useState<TaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const hasData = data !== null;

  useEffect(() => {
    let alive = true;
    if (!hasData) setLoading(true);
    fetch(`${apiPrefix}/tax-lots`)
      .then((r) => r.json())
      .then((j) => alive && setData(j))
      .catch(() => { /* keep last-known data to avoid flicker */ })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [refreshTick, apiPrefix, hasData]);

  if (loading) {
    return (
      <CollapsibleCard storageKey="card:tax-lots" helpSection="tax-lots" title="Tax lots" subtitle="Each execution tracked as a lot. ST vs LT classification, TLH candidates, LTCG countdown.">
        <div className="h-[80px] grid place-items-center subtle text-sm">
          <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Computing tax report…</span>
        </div>
      </CollapsibleCard>
    );
  }
  if (!data) return null;

  if (data.lots.length === 0) {
    return (
      <CollapsibleCard storageKey="card:tax-lots" helpSection="tax-lots" title="Tax lots" subtitle="Log your first execution to see lot-level cost basis, ST vs LT status, and TLH candidates.">
        <div className="h-[80px] grid place-items-center subtle text-sm">
          No executions logged yet.
        </div>
      </CollapsibleCard>
    );
  }

  const t = data.totals;
  return (
    <CollapsibleCard
      storageKey="card:tax-lots"
      helpSection="tax-lots"
      title="Tax lots & TLH"
      subtitle="Each execution = a tax lot. STCG (held ≤ 1 yr, taxed up to 37%) vs LTCG (> 1 yr, taxed 20%). TLH = harvest unrealized losses now to offset future gains."
      right={
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={t.unrealizedGain >= 0 ? "success" : "danger"}>
            Unrealized {t.unrealizedGain >= 0 ? "+" : ""}{fmtUsd(t.unrealizedGain)} ({(t.unrealizedGainPct * 100).toFixed(2)}%)
          </Badge>
          <Badge variant="default">{data.lots.length} lot{data.lots.length === 1 ? "" : "s"}</Badge>
        </div>
      }
    >

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Unrealized STCG"    value={fmtUsd(t.unrealizedSTCG)}    tone={t.unrealizedSTCG > 0 ? "warn" : undefined}  hint="Taxed up to 37%" />
        <Stat label="Unrealized LTCG"    value={fmtUsd(t.unrealizedLTCG)}    tone="gain"                                       hint="Taxed up to 20%" />
        <Stat label="Unrealized loss"    value={fmtUsd(t.unrealizedLoss)}    tone="loss"                                       hint="Available for harvest" />
        <Stat label="TLH opportunity"    value={fmtUsd(t.tlhOpportunity)}    tone={t.tlhOpportunity > 0 ? "gain" : undefined}  hint="Sum of lots with loss > $100" />
      </div>

      {/* Wait-for-LT savings hint */}
      {t.unrealizedSTCG > 0 && t.stcgTaxEstSavingsIfHeld > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 mb-4">
          💡 If you hold all STCG lots until they cross 1 year, you'd save approximately <span className="font-mono font-semibold">{fmtUsd(t.stcgTaxEstSavingsIfHeld)}</span> in taxes
          (assuming 37% STCG → 20% LTCG rate spread on ${fmtUsd(t.unrealizedSTCG)} of gains).
        </div>
      )}

      {data.approachingLT.length > 0 && (
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 mb-4">
          <div className="text-[11px] uppercase tracking-wider subtle mb-1.5"><Calendar className="w-3 h-3 inline mr-1" /> Lots approaching LTCG (within 60 days)</div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {data.approachingLT.map((l) => (
              <span key={l.id} className="rounded-md border border-line bg-surface-1 px-2 py-1">
                <span className="font-semibold">{l.ticker}</span> · {l.shares} sh · {l.daysUntilLT}d to LT
              </span>
            ))}
          </div>
        </div>
      )}

      {data.topTLHCandidates.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-50 dark:bg-red-950/30 px-3 py-2 mb-4">
          <div className="text-[11px] uppercase tracking-wider text-red-700 dark:text-red-300 mb-1.5">
            <AlertTriangle className="w-3 h-3 inline mr-1" /> Top tax-loss harvesting candidates
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {data.topTLHCandidates.map((l) => (
              <span key={l.id} className="rounded-md border border-red-500/40 bg-red-100 dark:bg-red-900/40 px-2 py-1 text-red-900 dark:text-red-100">
                <span className="font-semibold">{l.ticker}</span> · {l.shares} sh · loss {fmtUsd(l.unrealizedGain)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lot table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left subtle text-[11px] uppercase tracking-wider">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Ticker</th>
              <th className="py-2 pr-3 text-right">Shares</th>
              <th className="py-2 pr-3 text-right">Cost / share</th>
              <th className="py-2 pr-3 text-right">Current / share</th>
              <th className="py-2 pr-3 text-right">Cost basis</th>
              <th className="py-2 pr-3 text-right">Value</th>
              <th className="py-2 pr-3 text-right">Unrealized</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.lots.map((l) => (
              <tr key={l.id} className={`border-t border-line ${l.isTLHCandidate ? "bg-red-50/40 dark:bg-red-950/10" : ""}`}>
                <td className="py-2 pr-3 font-mono">{l.date}</td>
                <td className="py-2 pr-3 font-medium">{l.ticker}</td>
                <td className="py-2 pr-3 text-right font-mono">{l.shares}</td>
                <td className="py-2 pr-3 text-right font-mono">${l.price.toFixed(2)}</td>
                <td className="py-2 pr-3 text-right font-mono">${l.currentPrice.toFixed(2)}</td>
                <td className="py-2 pr-3 text-right font-mono">{fmtUsd(l.costBasis)}</td>
                <td className="py-2 pr-3 text-right font-mono">{fmtUsd(l.currentValue)}</td>
                <td className={`py-2 pr-3 text-right font-mono ${l.unrealizedGain >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                  {l.unrealizedGain >= 0 ? "+" : ""}{fmtUsd(l.unrealizedGain)}
                  <span className="ml-1 text-[10px] subtle">({(l.unrealizedGainPct * 100).toFixed(1)}%)</span>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={l.isLongTerm ? "success" : "warn"}>{l.isLongTerm ? "LT" : "ST"}</Badge>
                    {!l.isLongTerm && (
                      <span className="text-[10px] subtle font-mono">
                        {l.daysHeld}d ({l.daysUntilLT}d to LT)
                      </span>
                    )}
                    {l.isTLHCandidate && <Badge variant="danger">TLH</Badge>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[10px] subtle">
        Rates assumed: STCG 37% (top marginal), LTCG 20% (top). Actual rates depend on your bracket. TLH threshold: unrealized loss &gt; $100. This is informational only — not tax advice; consult a CPA before harvesting.
      </div>
    </CollapsibleCard>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "gain" | "loss" | "warn"; hint?: string }) {
  const cls = tone === "gain" ? "text-emerald-700 dark:text-emerald-300"
            : tone === "loss" ? "text-red-700 dark:text-red-300"
            : tone === "warn" ? "text-amber-700 dark:text-amber-300" : "";
  return (
    <div className="rounded-lg bg-surface-2 border border-line px-3 py-2">
      <div className="subtle text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-mono text-sm ${cls}`}>{value}</div>
      {hint && <div className="text-[9px] subtle mt-0.5">{hint}</div>}
    </div>
  );
}
