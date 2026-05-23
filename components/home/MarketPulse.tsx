"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

interface Quote { ticker: string; price: number; changePct: number; }
interface RegimeInfo { kind: string; multiplier: number; pendingKind?: string | null; pendingDays?: number; }

const SYMBOLS = ["SPY", "QQQ", "^VIX", "^TNX"];
const LABELS: Record<string, string> = { SPY: "SPY", QQQ: "QQQ", "^VIX": "VIX", "^TNX": "10Y" };
const HINTS: Record<string, string> = { SPY: "S&P 500", QQQ: "Nasdaq-100", "^VIX": "Volatility", "^TNX": "Treasury yield" };

function regimeStyle(kind: string): { bg: string; text: string; border: string; label: string } {
  switch (kind) {
    case "rally":      return { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/40", label: "Rally" };
    case "pullback":   return { bg: "bg-amber-500/10",   text: "text-amber-700 dark:text-amber-300",     border: "border-amber-500/40",   label: "Pullback" };
    case "correction": return { bg: "bg-red-500/10",     text: "text-red-700 dark:text-red-300",         border: "border-red-500/40",     label: "Correction" };
    default:           return { bg: "bg-slate-500/10",   text: "text-slate-700 dark:text-slate-300",     border: "border-slate-500/40",   label: "Neutral" };
  }
}

export function MarketPulse() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [regime, setRegime] = useState<RegimeInfo | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [qRes, rRes] = await Promise.all([
          fetch(`/api/quotes?symbols=${encodeURIComponent(SYMBOLS.join(","))}`).then((r) => r.json()),
          fetch("/api/regime").then((r) => r.json()),
        ]);
        if (!alive) return;
        if (Array.isArray(qRes?.data)) setQuotes(qRes.data);
        if (rRes && !rRes.error) setRegime(rRes);
      } catch { /* swallow — pulse is best-effort */ }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const byTicker = new Map(quotes?.map((q) => [q.ticker, q]) ?? []);
  const reg = regime ? regimeStyle(regime.kind) : regimeStyle("neutral");

  return (
    <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider subtle pr-2 border-r border-line">
          <Activity className="w-3.5 h-3.5" />
          Market pulse
        </div>
        {SYMBOLS.map((s) => {
          const q = byTicker.get(s);
          const up = (q?.changePct ?? 0) >= 0;
          // 10Y comes back as percent yield * 10 from Yahoo (^TNX). Display the price as-is — it's the yield in %.
          const priceFmt = s === "^TNX" ? `${q?.price?.toFixed(2) ?? "—"}%` :
                           s === "^VIX" ? (q?.price?.toFixed(2) ?? "—") :
                           q ? `$${q.price.toFixed(2)}` : "—";
          return (
            <div key={s} className="flex items-baseline gap-1.5 px-2 py-1" title={HINTS[s]}>
              <span className="text-xs subtle font-medium">{LABELS[s]}</span>
              <span className="text-sm font-mono">{priceFmt}</span>
              {q ? (
                <span className={`text-xs font-mono ${up ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                  {up ? "+" : ""}{q.changePct.toFixed(2)}%
                </span>
              ) : null}
            </div>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider subtle">Regime</span>
          <span className={`inline-flex items-center gap-1 rounded-md border ${reg.border} ${reg.bg} ${reg.text} text-xs font-semibold px-2 py-0.5`}>
            {reg.label}
            {regime ? <span className="font-mono opacity-80">×{regime.multiplier.toFixed(1)}</span> : null}
          </span>
          {regime?.pendingKind && regime.pendingKind !== regime.kind ? (
            <span className="text-[10px] subtle">→ {regime.pendingKind} ({regime.pendingDays}d)</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
