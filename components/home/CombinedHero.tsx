"use client";

import { useEffect, useState } from "react";
import { fmtUsd } from "@/lib/format";
import { TrendingUp, TrendingDown, Wallet, LineChart, DollarSign } from "lucide-react";

interface EquityPoint { date: string; costBasis: number; marketValue: number; gain: number; gainPct: number; spyBenchmark: number; spyGainPct: number; }
interface EquityResp { points?: EquityPoint[]; }
interface IncomeResp { totalProjectedAnnual?: number; }

interface Combined {
  costBasis: number;
  marketValue: number;
  gain: number;
  gainPct: number;
  spyGain: number;
  vsSpy: number;
  projectedAnnualDividends: number;
  hasData: boolean;
}

function reduceEquity(r: EquityResp | null): { cost: number; mv: number; gain: number; spyMv: number } {
  const last = r?.points?.[r.points.length - 1];
  if (!last) return { cost: 0, mv: 0, gain: 0, spyMv: 0 };
  return { cost: last.costBasis, mv: last.marketValue, gain: last.gain, spyMv: last.spyBenchmark };
}

export function CombinedHero() {
  const [data, setData] = useState<Combined | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [eq1, eq2, div1, div2]: [EquityResp, EquityResp, IncomeResp, IncomeResp] = await Promise.all([
          fetch("/api/equity-curve").then((r) => r.json()).catch(() => ({})),
          fetch("/api/stocks/equity-curve").then((r) => r.json()).catch(() => ({})),
          fetch("/api/dividends").then((r) => r.json()).catch(() => ({})),
          fetch("/api/stocks/dividends").then((r) => r.json()).catch(() => ({})),
        ]);
        if (!alive) return;
        const a = reduceEquity(eq1);
        const b = reduceEquity(eq2);
        const cost = a.cost + b.cost;
        const mv = a.mv + b.mv;
        const gain = a.gain + b.gain;
        const spyMv = a.spyMv + b.spyMv;
        const spyGain = spyMv - cost;
        setData({
          costBasis: cost,
          marketValue: mv,
          gain,
          gainPct: cost > 0 ? gain / cost : 0,
          spyGain,
          vsSpy: gain - spyGain,
          projectedAnnualDividends: (div1.totalProjectedAnnual ?? 0) + (div2.totalProjectedAnnual ?? 0),
          hasData: cost > 0,
        });
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0,1,2,3].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-surface-2/50 h-[78px] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-sm subtle">
        Log your first execution in either dashboard to see lifetime portfolio stats here.
      </div>
    );
  }

  const gainPos = data.gain >= 0;
  const vsSpyPos = data.vsSpy >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Tile
        icon={<Wallet className="w-4 h-4" />}
        label="Total deployed"
        value={fmtUsd(data.costBasis)}
        hint="Combined cost basis (ETF + Stocks)"
      />
      <Tile
        icon={<LineChart className="w-4 h-4" />}
        label="Current value"
        value={fmtUsd(data.marketValue)}
        sub={`${gainPos ? "+" : ""}${fmtUsd(data.gain)} (${(data.gainPct * 100).toFixed(2)}%)`}
        tone={gainPos ? "gain" : "loss"}
      />
      <Tile
        icon={vsSpyPos ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        label="vs SPY"
        value={`${vsSpyPos ? "+" : ""}${fmtUsd(data.vsSpy)}`}
        sub={vsSpyPos ? "Outperforming benchmark" : "Trailing benchmark"}
        tone={vsSpyPos ? "gain" : "loss"}
      />
      <Tile
        icon={<DollarSign className="w-4 h-4" />}
        label="Dividends (projected/yr)"
        value={fmtUsd(data.projectedAnnualDividends)}
        hint="Forward annual income at current shares"
      />
    </div>
  );
}

function Tile({
  icon, label, value, sub, hint, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  tone?: "gain" | "loss";
}) {
  const toneCls = tone === "gain" ? "text-emerald-700 dark:text-emerald-300"
                : tone === "loss" ? "text-red-700 dark:text-red-300"
                : "";
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider subtle">
        {icon} <span>{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold font-mono">{value}</div>
      {sub ? <div className={`text-xs font-mono ${toneCls}`}>{sub}</div> : hint ? <div className="text-[11px] subtle">{hint}</div> : null}
    </div>
  );
}
