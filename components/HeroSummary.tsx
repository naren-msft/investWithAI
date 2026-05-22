import Link from "next/link";
import type { PipelineResult } from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AutoRefresh } from "@/components/AutoRefresh";
import { HelpCircle } from "lucide-react";
import { fmtUsd } from "@/lib/format";

export function HeroSummary({ data }: { data: PipelineResult }) {
  const items = [
    { label: "Total capital",   value: fmtUsd(data.capital) },
    { label: "Portfolio value", value: fmtUsd(data.portfolioValue) },
    { label: "Deployed",        value: fmtUsd(data.deployedUsd) },
    { label: "Cash · buffer",   value: `${fmtUsd(data.cashUsd)} · ${fmtUsd(data.cashBuffer)}` },
  ];
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl bg-surface-2 border border-line px-4 py-3">
            <div className="text-[11px] uppercase subtle tracking-wider">{i.label}</div>
            <div className="text-xl font-semibold mt-1">{i.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
