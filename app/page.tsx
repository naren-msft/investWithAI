import { LineChart, TrendingUp } from "lucide-react";
import { MarketPulse } from "@/components/home/MarketPulse";
import { CombinedHero } from "@/components/home/CombinedHero";
import { PortfolioCard } from "@/components/home/PortfolioCard";
import { TickerSearch } from "@/components/home/TickerSearch";
import { HomeHero } from "@/components/home/HomeHero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { StockNews } from "@/components/home/StockNews";

export const dynamic = "force-static";

export default function Home() {
  return (
    <>
      <div className="home-bg" aria-hidden="true">
        <div className="home-blob home-blob-a" />
        <div className="home-blob home-blob-b" />
        <div className="home-blob home-blob-c" />
      </div>
      <main className="relative max-w-5xl mx-auto p-6 md:p-10 space-y-6">
      <HomeHero />

      <TickerSearch />

      <MarketPulse />

      <CombinedHero />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <PortfolioCard
          href="/etf"
          icon={<LineChart className="w-6 h-6" />}
          title="ETF Portfolio"
          subtitle="Diversified across 9 sleeves"
          bullets={[
            "5-tranche phased deployment ($35K capital, $3K buffer)",
            "Sector hard/soft caps + ETF top-holdings overlap",
            "Bond ballast + international + commodity sleeves",
          ]}
          ctaLabel="Open ETF dashboard"
          apiPrefix="/api"
        />
        <PortfolioCard
          href="/stocks"
          icon={<TrendingUp className="w-6 h-6" />}
          title="Stock Portfolio"
          subtitle="AI infra · quantum · speculative"
          bullets={[
            "19 individual stocks across 3 conviction tiers ($50K / $10K buffer)",
            "Tier-aware RSI/MACD signals + per-name position caps",
            "Themed sleeves: AI semis, AI power, quantum, quantum-security",
          ]}
          ctaLabel="Open Stock dashboard"
          apiPrefix="/api/stocks"
        />
      </div>

      <StockNews />

      <HowItWorks />

      <footer className="mt-12 p-4 text-xs subtle border-t border-line text-center">
        <strong className="text-ink/80">Educational use only — not investment advice.</strong>{" "}
        Live market data from Yahoo Finance. Past performance does not guarantee future results.
      </footer>
      </main>
    </>
  );
}
