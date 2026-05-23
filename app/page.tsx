import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { LineChart, TrendingUp, ArrowRight } from "lucide-react";

export const dynamic = "force-static";

export default function Home() {
  return (
    <main className="max-w-5xl mx-auto p-6 md:p-10">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">InvestWithAI</h1>
        <p className="subtle mt-3 text-base md:text-lg">
          Multi-agent portfolio management with live market data, regime detection, and tiered tranche deployment.
        </p>
        <p className="text-xs subtle mt-2">Pick a portfolio to open its dashboard.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Link href="/etf" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-lg group-hover:border-emerald-500/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <LineChart className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold">ETF Portfolio</h2>
                <p className="subtle text-xs">Diversified across 9 sleeves</p>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-ink/80">
              <li>• 5-tranche phased deployment ($35K capital, $3K buffer)</li>
              <li>• Sector hard/soft caps + ETF top-holdings overlap</li>
              <li>• Bond ballast + international + commodity sleeves</li>
            </ul>
            <div className="mt-5 inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300 font-medium">
              Open ETF dashboard <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Card>
        </Link>

        <Link href="/stocks" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-lg group-hover:border-emerald-500/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold">Stock Portfolio</h2>
                <p className="subtle text-xs">AI infra · quantum · speculative</p>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-ink/80">
              <li>• 19 individual stocks across 3 conviction tiers ($50K / $10K buffer)</li>
              <li>• Tier-aware RSI/MACD signals + per-name position caps</li>
              <li>• Themed sleeves: AI semis, AI power, quantum, quantum-security</li>
            </ul>
            <div className="mt-5 inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300 font-medium">
              Open Stock dashboard <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Card>
        </Link>
      </div>

      <footer className="mt-12 p-4 text-xs subtle border-t border-line text-center">
        <strong className="text-ink/80">Educational use only — not investment advice.</strong>{" "}
        Live market data from Yahoo Finance. Past performance does not guarantee future results.
      </footer>
    </main>
  );
}
