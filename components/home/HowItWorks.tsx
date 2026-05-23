"use client";

import { useState } from "react";
import { ChevronDown, Activity, Target, ShieldAlert, Receipt, GitBranch } from "lucide-react";

const STEPS = [
  {
    Icon: Activity,
    title: "Regime detection",
    desc: "Daily macro signals (SPY trend, VIX, breadth) classify the market into rally / neutral / pullback / correction. Hysteresis prevents flip-flopping. Each regime sets a sizing multiplier (0.7× / 1.0× / 1.2× / 1.5×).",
  },
  {
    Icon: Target,
    title: "Drift & target weights",
    desc: "Each portfolio has fixed sleeve weights. Live prices drive current vs target dollars. Drift over ±5pp triggers rebalance signals; over ±10pp is flagged as a breach.",
  },
  {
    Icon: GitBranch,
    title: "Tranche deployment",
    desc: "Capital deploys in phased tranches (5 for ETFs, 3 for stocks). A tranche unlocks via OR-gates: days elapsed, SPY drawdown, or regime confirmation — never all at once.",
  },
  {
    Icon: ShieldAlert,
    title: "Risk overlays",
    desc: "Sleeve hard/soft caps, ETF top-holding overlap, RSI/MACD per-name signals, and bond/cash ballast prevent any single bet from dominating. Skipped buys are logged with reason codes.",
  },
  {
    Icon: Receipt,
    title: "Tax-lot accounting",
    desc: "Every execution is tracked as an individual lot. Lots crossing 365 days flip to LTCG (lower tax). Loss harvest candidates surface when unrealized loss > $100.",
  },
];

export function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-line bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 md:px-5 py-3 flex items-center justify-between hover:bg-card-soft transition"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm md:text-base">How it works</span>
          <span className="text-xs subtle">5 layers of the pipeline</span>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 md:px-5 pb-5 pt-1 border-t border-line">
          <ol className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {STEPS.map(({ Icon, title, desc }, i) => (
              <li key={title} className="rounded-lg border border-line bg-card-soft p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-xs subtle font-semibold">Step {i + 1}</div>
                </div>
                <div className="font-semibold text-sm">{title}</div>
                <p className="text-xs subtle mt-1 leading-relaxed">{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
