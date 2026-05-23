import Link from "next/link";
import type { PipelineResult } from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CapitalEditor } from "@/components/CapitalEditor";
import { HelpCircle } from "lucide-react";
import { fmtUsd } from "@/lib/format";

export function HeroSummary({ data }: { data: PipelineResult }) {
  const deployable = Math.max(0, data.capital - data.cashBuffer);
  const availableToDeploy = Math.max(0, data.cashUsd - data.cashBuffer);
  const deployedPct = deployable > 0 ? Math.min(100, (data.deployedUsd / deployable) * 100) : 0;
  const availablePct = deployable > 0 ? Math.min(100, (availableToDeploy / deployable) * 100) : 0;

  // Tone for "Available to deploy": fresh-green when most of the powder is
  // still dry, ambers as it drains, red when nearly empty.
  const availTone =
    availablePct >= 75 ? "gain" :
    availablePct >= 25 ? "warn" :
                         "loss";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-xs subtle uppercase tracking-wider">Dashboard</div>
          <h1 className="text-2xl font-semibold tracking-tight">ETF Portfolio · Fidelity</h1>
          <p className="text-sm subtle mt-1">
            Multi-agent allocation across {data.drift.length} ETFs, staged deployment, live RSI/MACD signals.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant="info">As of {new Date(data.asOf).toLocaleTimeString()}</Badge>
          <Badge variant={data.dayPnlUsd >= 0 ? "success" : "danger"}>
            Day P/L {fmtUsd(data.dayPnlUsd, true)}
          </Badge>
          <CapitalEditor capital={data.capital} cashBuffer={data.cashBuffer} />
          <AutoRefresh />
          <Link
            href="/help"
            title="How the dashboard works"
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 text-xs px-2.5 py-1.5 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" /> Help
          </Link>
          <ThemeToggle />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCell label="Total capital"    value={fmtUsd(data.capital)} />
        <StatCell label="Portfolio value"  value={fmtUsd(data.portfolioValue)} />
        <StatCell
          label="Deployed"
          value={fmtUsd(data.deployedUsd)}
          fillPct={deployedPct}
          fillTone="gain"
          subline={`${deployedPct.toFixed(0)}% of ${fmtUsd(deployable)} deployable`}
        />
        <StatCell
          label="Available to deploy"
          value={fmtUsd(availableToDeploy)}
          fillPct={availablePct}
          fillTone={availTone}
          subline={`${availablePct.toFixed(0)}% of dry powder left`}
        />
        <StatCell
          label="Reserved buffer"
          value={fmtUsd(data.cashBuffer)}
          subline="Locked — never deployed"
        />
      </div>
    </Card>
  );
}

function StatCell({
  label,
  value,
  fillPct,
  fillTone,
  subline,
}: {
  label: string;
  value: string;
  fillPct?: number;
  fillTone?: "gain" | "warn" | "loss";
  subline?: string;
}) {
  const baseTint =
    fillTone === "gain" ? "bg-emerald-500"
    : fillTone === "warn" ? "bg-amber-500"
    : fillTone === "loss" ? "bg-red-500"
    : "bg-brand";
  return (
    <div className="rounded-xl bg-surface-2 border border-line px-4 py-3 relative overflow-hidden">
      {fillPct != null && (
        <div
          className={`absolute inset-y-0 left-0 ${baseTint} opacity-15`}
          style={{ width: `${Math.max(0, Math.min(100, fillPct))}%` }}
          aria-hidden
        />
      )}
      <div className="relative">
        <div className="text-[11px] uppercase subtle tracking-wider">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
        {subline && <div className="mt-0.5 text-[10px] subtle">{subline}</div>}
      </div>
    </div>
  );
}
