"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/home/Sparkline";
import { fmtUsd } from "@/lib/format";
import { ArrowRight } from "lucide-react";

interface EquityPoint { date: string; costBasis: number; marketValue: number; gain: number; gainPct: number; }
interface EquityResp { points?: EquityPoint[]; }

export function PortfolioCard({
  href,
  icon,
  title,
  subtitle,
  bullets,
  ctaLabel,
  apiPrefix,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  bullets: string[];
  ctaLabel: string;
  apiPrefix: string;
}) {
  const [points, setPoints] = useState<EquityPoint[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${apiPrefix}/equity-curve`)
      .then((r) => r.json())
      .then((j: EquityResp) => { if (alive) setPoints(j.points ?? []); })
      .catch(() => { if (alive) setPoints([]); });
    return () => { alive = false; };
  }, [apiPrefix]);

  const last30 = (points ?? []).slice(-30);
  const series = last30.map((p) => p.marketValue);
  const latest = last30[last30.length - 1];
  const first = last30[0];
  const periodGain = latest && first ? latest.marketValue - first.marketValue : 0;
  const periodGainPct = latest && first && first.marketValue > 0 ? periodGain / first.marketValue : 0;
  const positive = periodGain >= 0;

  return (
    <Link href={href} className="group block h-full">
      <Card className="h-full flex flex-col transition-shadow group-hover:shadow-lg group-hover:border-emerald-500/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-semibold">{title}</h2>
            <p className="subtle text-xs">{subtitle}</p>
          </div>
        </div>

        {points && series.length >= 2 ? (
          <div className="mt-4 rounded-lg border border-line bg-surface-2/40 px-3 py-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider subtle">Current value</div>
              <div className="text-lg font-mono font-semibold">{fmtUsd(latest!.marketValue)}</div>
              <div className={`text-xs font-mono ${positive ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                30d {positive ? "+" : ""}{fmtUsd(periodGain)} ({(periodGainPct * 100).toFixed(2)}%)
              </div>
            </div>
            <Sparkline values={series} positive={positive} />
          </div>
        ) : points && series.length < 2 ? (
          <div className="mt-4 rounded-lg border border-dashed border-line px-3 py-2 text-[11px] subtle">
            Log executions to see your 30-day growth here.
          </div>
        ) : (
          <div className="mt-4 h-[58px] rounded-lg border border-line bg-surface-2/40 animate-pulse" />
        )}

        <ul className="mt-4 space-y-1.5 text-sm text-ink/80">
          {bullets.map((b, i) => <li key={i}>• {b}</li>)}
        </ul>
        <div className="mt-auto pt-5">
          <div className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-semibold text-sm px-4 py-2.5 shadow-sm transition-colors">
            {ctaLabel} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
