// Gem-mode discovery feed.
//
// Augments the curated theme universe with small/mid-cap tickers pulled from
// the top holdings of growth/innovation-focused ETFs. Gated by the
// SCREENER_DISCOVERY=on env flag — this can up to triple the per-screen API
// load, so it is opt-in even within gem mode.

import { getEtfHoldings } from "@/lib/overlap";
import type { ThemeTicker, Theme, MoatType } from "@/config/screener-themes";

// Curated source ETFs. Each provides ~25 holdings on Yahoo's `topHoldings`
// module. We deliberately bias toward small/mid-cap thematic vehicles to find
// names that *aren't* already in the AAPL/MSFT mega-cap consensus.
const DISCOVERY_ETFS: { etf: string; theme: string }[] = [
  { etf: "ARKK", theme: "Disruptive Innovation" },
  { etf: "ARKG", theme: "Genomic Revolution" },
  { etf: "SMH",  theme: "Semiconductors" },
  { etf: "XBI",  theme: "Biotech" },
  { etf: "KWEB", theme: "China Internet" },
  { etf: "ICLN", theme: "Clean Energy" },
];

const MAX_DISCOVERY_NEW = 25;       // hard cap on additions to control API load
const PER_ETF_TOP_N    = 10;        // pull top 10 from each ETF

interface DiscoveryCacheEntry {
  at: number;
  tickers: DiscoveredTicker[];
}

export interface DiscoveredTicker extends ThemeTicker {
  discoverySource: string;          // e.g. "via ARKK"
}

const cache: { entry: DiscoveryCacheEntry | null } = { entry: null };
const CACHE_MS = 60 * 60 * 1000;    // 1 hour — same TTL as ETF holdings cache

/**
 * Returns true if the SCREENER_DISCOVERY env flag is enabled.
 */
export function isDiscoveryEnabled(): boolean {
  return process.env.SCREENER_DISCOVERY === "on";
}

/**
 * Fetch a curated set of discovery tickers, excluding any already in the
 * `existingTickers` set. Capped at MAX_DISCOVERY_NEW.
 */
export async function getDiscoveryTickers(
  existingTickers: Set<string>,
): Promise<DiscoveredTicker[]> {
  if (cache.entry && Date.now() - cache.entry.at < CACHE_MS) {
    // Re-apply the exclusion filter (existing set can change per call).
    return cache.entry.tickers.filter((t) => !existingTickers.has(t.ticker));
  }

  const seen = new Set<string>(existingTickers);
  const out: DiscoveredTicker[] = [];

  for (const { etf, theme } of DISCOVERY_ETFS) {
    if (out.length >= MAX_DISCOVERY_NEW) break;
    let holdings;
    try {
      const h = await getEtfHoldings(etf);
      holdings = h.topHoldings;
    } catch {
      continue;
    }

    for (const h of holdings.slice(0, PER_ETF_TOP_N)) {
      if (out.length >= MAX_DISCOVERY_NEW) break;
      const symbol = (h.symbol || "").trim().toUpperCase();
      // Filter out junk symbols, cash placeholders, and already-known tickers.
      if (!symbol || symbol.length > 6) continue;
      if (/[^A-Z.\-]/.test(symbol)) continue;
      if (seen.has(symbol)) continue;
      seen.add(symbol);
      out.push({
        ticker: symbol,
        name: h.name || symbol,
        tag: "venture",                        // discovery tickers default to venture (lowest bar)
        chokepoint: `Discovery candidate from ${etf} top holdings — ${theme}`,
        moatType: "intangible" as MoatType,    // placeholder; we don't know the actual moat
        discoverySource: `via ${etf}`,
      });
    }
  }

  cache.entry = { at: Date.now(), tickers: out };
  return out;
}

/**
 * Build a synthetic Theme entry for discovery rows so `findPrimaryTheme`-style
 * lookups have somewhere to anchor. We expose it under a single "discovery"
 * theme key (NOT one of the typed ThemeKey enum members — callers must handle
 * this as a special-case label outside the strict-typed theme set).
 */
export function buildDiscoveryTheme(rows: DiscoveredTicker[]): Theme {
  return {
    // The "discovery" theme key is reserved for runtime-built synthetic themes
    // (see `lib/screener/discovery.ts`); not part of the curated theme list.
    key: "discovery",
    label: "Discovery feed",
    rationale: "Names pulled from thematic ETF top holdings to surface gems outside the curated universe.",
    sleeveCapPct: 5,
    tickers: rows,
  };
}
