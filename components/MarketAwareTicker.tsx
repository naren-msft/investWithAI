"use client";

import { useEffect, useState } from "react";
import type { BuyRecommendation } from "@/types";
import { TickerMarquee } from "@/components/TickerMarquee";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";
import { getMarketStatus } from "@/lib/marketStatus";

/**
 * Top-of-page slot that shows the live `TickerMarquee` while US markets
 * are open, and replaces it with the `MarketStatusBanner` (with live
 * countdown) when markets are closed. On early-close trading days both
 * are shown: the marquee plus a thin warning strip from the banner.
 */
export function MarketAwareTicker({
  recs,
  asOf,
}: {
  recs: BuyRecommendation[];
  asOf: string;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Server-render the marquee so first paint matches existing layout;
  // the banner takes over after hydration if markets are actually closed.
  if (!now) {
    return <TickerMarquee recs={recs} asOf={asOf} />;
  }

  const status = getMarketStatus(now);
  const marketOpen = status.state === "open" || status.state === "early-close";

  return (
    <div className="space-y-3">
      <MarketStatusBanner />
      {marketOpen && <TickerMarquee recs={recs} asOf={asOf} />}
    </div>
  );
}
