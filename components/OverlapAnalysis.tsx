"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface StockExposure {
  symbol: string;
  name: string;
  effectiveWeight: number;
  contributors: { ticker: string; weightInEtf: number; portfolioWeight: number; contribution: number }[];
}
interface SectorExposure { sector: string; effectiveWeight: number; }
interface OverlapResult {
  asOf: string;
  topStockExposures: StockExposure[];
  sectorExposures: SectorExposure[];
  totalTopHoldingsCoverage: number;
}

const KEY = "investai.overlap.open";

export function OverlapAnalysis({ refreshTick }: { refreshTick?: number }) {
  const [data, setData] = useState<OverlapResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Persist expand/collapse choice across reloads.
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "open") setOpen(true);
      else if (v === "closed") setOpen(false);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/overlap")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) { setErr(j.error); setData(null); }
        else setData(j);
      })
      .catch((e) => alive && setErr(String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [refreshTick]);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      try { localStorage.setItem(KEY, next ? "open" : "closed"); } catch {}
      return next;
    });
  }

  if (loading) {
    return (
      <Card>
        <CardHeader helpSection="overlap" title="Hidden concentration & sector X-ray" subtitle="Computing true single-stock and sector exposures across all ETFs…" />
        <div className="h-[60px] grid place-items-center subtle text-sm">
          <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Fetching holdings…</span>
        </div>
      </Card>
    );
  }
  if (err || !data) {
    return (
      <Card>
        <CardHeader helpSection="overlap" title="Hidden concentration & sector X-ray" />
        <div className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {err ?? "no data"}
        </div>
      </Card>
    );
  }

  const totalTopStockWeight = data.topStockExposures.reduce((s, x) => s + x.effectiveWeight, 0);
  const heaviest = data.topStockExposures[0];
  const top3 = data.topStockExposures.slice(0, 3).map((s) => `${s.symbol} ${(s.effectiveWeight * 100).toFixed(1)}%`).join(" · ");

  return (
    <Card>
      <CardHeader helpSection="overlap"
        title="Hidden concentration & sector X-ray"
        subtitle="Decomposes all ETFs into their underlying stocks and sectors. Same stock held in 3 ETFs adds up."
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="info">Coverage {(data.totalTopHoldingsCoverage * 100).toFixed(0)}%</Badge>
            {heaviest && (
              <Badge variant={heaviest.effectiveWeight > 0.12 ? "danger" : heaviest.effectiveWeight > 0.08 ? "warn" : "default"}>
                Heaviest: {heaviest.symbol} ≈ {(heaviest.effectiveWeight * 100).toFixed(1)}%
              </Badge>
            )}
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 hover:bg-surface-3 text-xs px-2 py-1 transition-colors"
              title={open ? "Collapse" : "Expand"}
            >
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {open ? "Collapse" : "Expand"}
            </button>
          </div>
        }
      />

      {hydrated && !open ? (
        <div className="text-xs subtle">
          Top 3 effective single-stock exposures: <span className="font-mono text-ink">{top3}</span>. Click <span className="font-medium">Expand</span> for full breakdown + sector X-ray.
        </div>
      ) : null}

      {open ? (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider subtle mb-2">Top single-stock exposures (effective % of total portfolio)</div>
              <div className="space-y-2">
                {data.topStockExposures.map((s) => {
                  const pct = s.effectiveWeight * 100;
                  const tone: "brand" | "warn" | "info" = pct > 10 ? "warn" : "brand";
                  return (
                    <div key={s.symbol} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-sm">{s.symbol}</span>
                          <span className="subtle text-xs truncate">{s.name}</span>
                        </div>
                        <span className={`font-mono text-sm ${pct > 10 ? "text-amber-700 dark:text-amber-300" : ""}`}>{pct.toFixed(2)}%</span>
                      </div>
                      <div className="mt-1.5"><ProgressBar value={pct} max={Math.max(15, totalTopStockWeight * 100)} tone={tone} /></div>
                      <div className="mt-1 text-[10px] subtle">
                        From: {s.contributors.map((c) => `${c.ticker} ${(c.weightInEtf * 100).toFixed(1)}%`).join(" · ")}
                      </div>
                    </div>
                  );
                })}
                {data.topStockExposures.length === 0 && <div className="text-sm subtle">No underlying holdings could be fetched.</div>}
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider subtle mb-2">True sector exposure (aggregated across all ETFs)</div>
              <div className="space-y-2">
                {data.sectorExposures.map((s) => {
                  const pct = s.effectiveWeight * 100;
                  return (
                    <div key={s.sector} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">{s.sector}</span>
                        <span className="font-mono text-sm">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="mt-1.5"><ProgressBar value={pct} max={50} tone="info" /></div>
                    </div>
                  );
                })}
                {data.sectorExposures.length === 0 && <div className="text-sm subtle">No sector data could be fetched.</div>}
              </div>
            </div>
          </div>

          <div className="mt-3 text-[11px] subtle">
            Yahoo Finance returns only top-10 holdings per ETF, so coverage is ~{(data.totalTopHoldingsCoverage * 100).toFixed(0)}% — these are floor estimates;
            actual concentration may be slightly higher. Bond ETFs (FBND) don&apos;t decompose into stocks.
          </div>
        </>
      ) : null}
    </Card>
  );
}
