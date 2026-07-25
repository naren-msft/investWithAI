"use client";

import { useEffect, useState } from "react";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Badge } from "@/components/ui/Badge";
import { Activity, AlertTriangle, Loader2 } from "lucide-react";

type EwPhase =
  | "W1" | "W2" | "W3" | "W3-of-3" | "W4" | "W5"
  | "A" | "B" | "C" | "UNKNOWN";

interface Row {
  ticker: string;
  phase: EwPhase;
  price: number;
  invalidationPrice: number | null;
  primaryTarget: number | null;
  distancePct: number | null;
  isBreached: boolean;
  isNearBreach: boolean;
  confidence: number;
  source: string | null;
  lastUpdated: string | null;
  note: string | null;
}

interface Report {
  asOf: string;
  dataAsOf: string;
  rows: Row[];
  coverage: { total: number; counted: number; breached: number; nearBreach: number; autoCount: number; manualCount: number };
}

type SignalKind = "BUY" | "STRONG BUY" | "HOLD" | "CAUTION" | "AVOID" | "—";

const PHASE_META: Record<EwPhase, {
  label: string;
  variant: "success" | "info" | "warn" | "danger" | "default";
  description: string;
  signal: SignalKind;
  signalVariant: "success" | "info" | "warn" | "danger" | "default";
}> = {
  "W1":      { label: "W1",       variant: "info",    description: "Initial impulse up — fresh trend, but unconfirmed",   signal: "HOLD",        signalVariant: "info" },
  "W2":      { label: "W2",       variant: "warn",    description: "Pullback after W1 — classic buy zone",                signal: "BUY",         signalVariant: "success" },
  "W3":      { label: "W3",       variant: "success", description: "Strongest motive wave — trend extension",             signal: "BUY",         signalVariant: "success" },
  "W3-of-3": { label: "W3 of W3", variant: "success", description: "Acceleration phase — highest-conviction trend leg",    signal: "STRONG BUY",  signalVariant: "success" },
  "W4":      { label: "W4",       variant: "warn",    description: "Consolidation after W3 — usually shallow, sideways",  signal: "HOLD",        signalVariant: "warn" },
  "W5":      { label: "W5",       variant: "info",    description: "Final push — top forming, often divergent",           signal: "CAUTION",     signalVariant: "warn" },
  "A":       { label: "A",        variant: "danger",  description: "First correction down — trend may be ending",          signal: "AVOID",       signalVariant: "danger" },
  "B":       { label: "B",        variant: "danger",  description: "Counter-trend rally inside correction — don't chase", signal: "AVOID",       signalVariant: "danger" },
  "C":       { label: "C",        variant: "danger",  description: "Capitulation low — potential bottom but knife-catch", signal: "HOLD",        signalVariant: "warn" },
  "UNKNOWN": { label: "—",        variant: "default", description: "No clear wave structure — auto-counter abstained",    signal: "—",           signalVariant: "default" },
};

function fmtPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export function InvalidationWatch({
  refreshTick,
  apiPrefix = "/api/stocks",
}: {
  refreshTick?: number;
  apiPrefix?: string;
}) {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const hasData = data !== null;

  useEffect(() => {
    let alive = true;
    if (!hasData) setLoading(true);
    fetch(`${apiPrefix}/elliott-wave`)
      .then((r) => r.json())
      .then((j) => alive && setData(j))
      .catch(() => { /* keep last-known data to prevent flicker on auto-refresh */ })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [refreshTick, apiPrefix, hasData]);

  if (loading) {
    return (
      <CollapsibleCard
        storageKey="card:invalidation-watch"
        defaultCollapsed
        helpSection="invalidation-watch"
        title="Elliott Wave · Invalidation Watch"
        subtitle="Per-symbol wave count + the price level where the count is wrong."
      >
        <div className="h-[80px] grid place-items-center subtle text-sm">
          <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading wave data…</span>
        </div>
      </CollapsibleCard>
    );
  }
  if (!data) return null;

  const { coverage } = data;
  const counted = data.rows.filter((r) => r.phase !== "UNKNOWN");
  const breaches = data.rows.filter((r) => r.isBreached);
  const nearMisses = data.rows
    .filter((r) => r.isNearBreach && !r.isBreached)
    .sort((a, b) => Math.abs(a.distancePct ?? 1) - Math.abs(b.distancePct ?? 1));

  const sortedRows = [...data.rows].sort((a, b) => {
    if (a.isBreached !== b.isBreached) return a.isBreached ? -1 : 1;
    if (a.isNearBreach !== b.isNearBreach) return a.isNearBreach ? -1 : 1;
    const ad = a.distancePct == null ? Infinity : Math.abs(a.distancePct);
    const bd = b.distancePct == null ? Infinity : Math.abs(b.distancePct);
    return ad - bd;
  });

  const hasAlerts = breaches.length > 0 || nearMisses.length > 0;

  return (
    <CollapsibleCard
      storageKey="card:invalidation-watch"
      defaultCollapsed
      helpSection="invalidation-watch"
      title="Elliott Wave · Invalidation Watch"
      subtitle="Auto-detected wave counts via ZigZag pivots + Fibonacci scoring. Manual overrides in config/elliott-wave.json take precedence."
      right={
        <div className="flex items-center gap-2 flex-wrap">
          {breaches.length > 0 && (
            <Badge variant="danger">
              <AlertTriangle className="w-3 h-3 mr-0.5" /> {breaches.length} breached
            </Badge>
          )}
          {nearMisses.length > 0 && (
            <Badge variant="warn">{nearMisses.length} near</Badge>
          )}
          <Badge variant="info">
            <Activity className="w-3 h-3 mr-0.5" />
            {coverage.counted} of {coverage.total} counted
          </Badge>
          {coverage.manualCount > 0 && (
            <Badge variant="success">{coverage.manualCount} manual</Badge>
          )}
        </div>
      }
    >

      {/* Always-visible alert strip when there's something to act on */}
      {hasAlerts && (
        <div className="mt-2 space-y-1.5">
          {breaches.map((r) => (
            <div key={`b-${r.ticker}`} className="flex items-center gap-2 text-xs bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 rounded-md px-2 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <strong className="font-mono">{r.ticker}</strong>
              <span className="opacity-80">{PHASE_META[r.phase].label} count broken</span>
              <span className="ml-auto font-mono">
                {fmtPrice(r.price)} vs invalidation {fmtPrice(r.invalidationPrice)} ({fmtPct(r.distancePct)})
              </span>
            </div>
          ))}
          {nearMisses.map((r) => (
            <div key={`n-${r.ticker}`} className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-md px-2 py-1.5">
              <strong className="font-mono">{r.ticker}</strong>
              <span className="opacity-80">{PHASE_META[r.phase].label} near invalidation</span>
              <span className="ml-auto font-mono">
                {fmtPrice(r.price)} → invalidation {fmtPrice(r.invalidationPrice)} ({fmtPct(r.distancePct)})
              </span>
            </div>
          ))}
        </div>
      )}

      {counted.length === 0 ? (
        <div className="mt-3 text-sm subtle p-3 border border-dashed border-line rounded-md">
          The auto-counter could not identify a clean wave structure on any symbol. This usually means the
              price history is too short or too choppy. You can populate counts manually in{" "}
              <code className="kbd">config/elliott-wave.json</code>.
            </div>
          ) : (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left subtle text-[11px] uppercase tracking-wider">
                    <th className="py-2 pr-3">Ticker</th>
                    <th className="py-2 pr-3">Phase</th>
                    <th className="py-2 pr-3">Signal</th>
                    <th className="py-2 pr-3 text-right">Price</th>
                    <th className="py-2 pr-3 text-right">Invalidation</th>
                    <th className="py-2 pr-3 text-right">Distance</th>
                    <th className="py-2 pr-3 text-right">Target</th>
                    <th className="py-2 pr-3 text-right">Conf.</th>
                    <th className="py-2 pr-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => {
                    const meta = PHASE_META[r.phase];
                    const rowCls = r.isBreached
                      ? "border-t border-red-500/30 bg-red-500/5"
                      : r.isNearBreach
                      ? "border-t border-amber-500/30 bg-amber-500/5"
                      : "border-t border-line";
                    return (
                      <tr key={r.ticker} className={rowCls}>
                        <td className="py-2 pr-3 font-medium font-mono align-top">{r.ticker}</td>
                        <td className="py-2 pr-3 align-top">
                          <div className="flex flex-col gap-0.5">
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                            <span className="text-[11px] subtle leading-snug max-w-[18ch]">{meta.description}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-3 align-top">
                          {meta.signal === "—" ? (
                            <span className="subtle">—</span>
                          ) : (
                            <Badge variant={meta.signalVariant}>{meta.signal}</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono align-top">{fmtPrice(r.price)}</td>
                        <td className="py-2 pr-3 text-right font-mono align-top">{fmtPrice(r.invalidationPrice)}</td>
                        <td className={`py-2 pr-3 text-right font-mono align-top ${r.isBreached ? "text-red-600 dark:text-red-300" : r.isNearBreach ? "text-amber-700 dark:text-amber-300" : ""}`}>
                          {fmtPct(r.distancePct)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono align-top">{fmtPrice(r.primaryTarget)}</td>
                        <td className="py-2 pr-3 text-right font-mono align-top">{r.phase === "UNKNOWN" ? "—" : r.confidence.toFixed(2)}</td>
                        <td className="py-2 pr-3 subtle text-xs align-top" title={r.note ?? undefined}>
                          {r.source ?? (r.note ?? "—")}
                          {r.lastUpdated ? <span className="ml-1 opacity-60">({r.lastUpdated})</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] subtle mt-3 leading-relaxed">
            <strong>Phase → Signal:</strong> W2/W3 = BUY, W3-of-3 = STRONG BUY, W1/W4/C = HOLD, W5 = CAUTION,
            A/B = AVOID. These signals reflect EW theory only and are independent of the dashboard's primary
            BUY/HOLD/AVOID recommendations (which use RSI, MACD, drift, sleeve caps, and tier thresholds).
            Use this as a cross-check, not a replacement.
          </p>
          <p className="text-[11px] subtle mt-3 leading-relaxed">
            <strong>Display only.</strong> Elliott Wave signals do not currently influence position sizing or
            deployment phases. Counts are auto-detected via a ZigZag pivot + Fibonacci ratio heuristic
            (tier-aware: 7% / 9% / 12% retracement threshold for core / growth / speculative). The 3 cardinal
            rules are enforced: W2 ≤ 100% of W1, W3 is never the shortest motive wave, W4 cannot overlap W1.
            Confidence reflects fit quality — treat low-confidence counts skeptically. Override any auto count
            by editing <code className="kbd">config/elliott-wave.json</code>; manual entries take precedence.
          </p>
    </CollapsibleCard>
  );
}
