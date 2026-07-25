"use client";

import { useEffect, useState } from "react";
import { SpyBackdrop } from "./SpyBackdrop";
import { Typewriter } from "./Typewriter";

const TAGLINES = [
  "regime-aware deployment.",
  "drift-driven rebalancing.",
  "tax-lot intelligent.",
  "tranche-by-tranche discipline.",
  "live market signals.",
];

type RegimeKind = "rally" | "pullback" | "correction" | "neutral" | string;

function regimeBadge(kind: RegimeKind): { mood: "bull" | "bear" | "neutral"; emoji: string; label: string; pill: string; halo: string } {
  switch (kind) {
    case "rally":
      return {
        mood: "bull", emoji: "🐂", label: "Bullish regime",
        pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
        halo: "regime-bull",
      };
    case "correction":
    case "pullback":
      return {
        mood: "bear", emoji: "🐻", label: kind === "correction" ? "Bearish · correction" : "Bearish · pullback",
        pill: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40",
        halo: "regime-bear",
      };
    default:
      return {
        mood: "neutral", emoji: "🐂🐻", label: "Neutral",
        pill: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/40",
        halo: "",
      };
  }
}

export function HomeHero() {
  const [regimeKind, setRegimeKind] = useState<RegimeKind>("neutral");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/regime").then((x) => x.json());
        if (alive && r && !r.error && typeof r.kind === "string") setRegimeKind(r.kind);
      } catch { /* best-effort */ }
    }
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const badge = regimeBadge(regimeKind);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-white/45 dark:bg-black/35 backdrop-blur-sm px-5 py-4 md:py-5">
      <SpyBackdrop />
      <div className="relative flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`inline-flex items-center justify-center w-10 h-10 rounded-full border ${badge.pill} ${badge.halo} text-xl shrink-0`}
            title={badge.label}
            aria-label={badge.label}
          >
            {badge.emoji}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 via-sky-600 to-rose-600 dark:from-emerald-400 dark:via-sky-400 dark:to-rose-400 bg-clip-text text-transparent leading-tight">
              InvestWithAI
            </h1>
            <p className="text-xs md:text-sm subtle truncate">
              Multi-agent portfolio management — <Typewriter phrases={TAGLINES} className="font-semibold text-ink" />
            </p>
          </div>
        </div>
        <div className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full border ${badge.pill}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${badge.mood === "bull" ? "bg-emerald-500" : badge.mood === "bear" ? "bg-rose-500" : "bg-slate-400"}`} />
          {badge.label}
        </div>
      </div>
    </div>
  );
}
