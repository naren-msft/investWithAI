"use client";

import { SpyBackdrop } from "./SpyBackdrop";
import { Typewriter } from "./Typewriter";

const TAGLINES = [
  "regime-aware deployment.",
  "drift-driven rebalancing.",
  "tax-lot intelligent.",
  "tranche-by-tranche discipline.",
  "live market signals.",
];

export function HomeHero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-emerald-500/5 via-transparent to-indigo-500/5 px-6 py-10 md:py-14 text-center">
      <SpyBackdrop />
      <div className="relative">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 via-sky-600 to-indigo-600 dark:from-emerald-400 dark:via-sky-400 dark:to-indigo-400 bg-clip-text text-transparent">
          InvestWithAI
        </h1>
        <p className="mt-4 text-base md:text-lg subtle">
          Multi-agent portfolio management — <Typewriter phrases={TAGLINES} className="font-semibold text-ink" />
        </p>
      </div>
    </div>
  );
}
