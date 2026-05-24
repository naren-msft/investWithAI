import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ArrowRight, Filter } from "lucide-react";

export function ScreenerCard() {
  return (
    <Link href="/screener" className="group block h-full">
      <Card className="h-full flex flex-col transition-shadow group-hover:shadow-lg group-hover:border-emerald-500/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <Filter className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-semibold">Stock Screener</h2>
            <p className="subtle text-xs">Early-trend secular themes</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-line bg-surface-2/40 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider subtle">Pipeline</div>
          <div className="text-sm font-medium mt-0.5">3-gate funnel · 9 themes · ~30 tickers</div>
          <div className="text-[11px] subtle mt-0.5">
            Fundamentals → Moat → Market confirmation → Confidence score
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 text-sm text-ink/80">
          <li>• 9 secular themes (AI compute, chip equipment, HBM, quantum, healthcare AI…)</li>
          <li>• Tier-aware thresholds: Core / Emerging / Venture</li>
          <li>• Minervini-style trend + confidence 0-100 + drill-down per name</li>
        </ul>
        <div className="mt-auto pt-5">
          <div className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-semibold text-sm px-4 py-2.5 shadow-sm transition-colors">
            Open Screener <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
