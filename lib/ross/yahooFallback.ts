import YahooFinance from "yahoo-finance2";
import { ROSS_CANDIDATE_LIMIT } from "@/config/ross";
import type { RossCandidate } from "./types";

// Yahoo Finance fallback candidate source. Used when the TradingView scanner
// returns nothing. Pulls predefined "gainers / small-cap" screeners and
// normalizes them into RossCandidate. Float is left null here (→ Pillar 5 N/A,
// flagged for manual check); the orchestrator may enrich float separately.
// Never throws — resolves to [] on failure.

const yahooFinance = new YahooFinance();
(yahooFinance as { suppressNotices?: (n: string[]) => void }).suppressNotices?.(["yahooSurvey", "ripHistorical"]);

// Predefined Yahoo screener IDs that surface Ross-style movers (default profile).
const SCR_IDS = ["small_cap_gainers", "day_gainers", "aggressive_small_caps"] as const;

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

interface YahooScreenerQuote {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  averageDailyVolume3Month?: number;
  averageDailyVolume10Day?: number;
  marketCap?: number;
  preMarketChangePercent?: number;
}

async function fetchScreener(scrId: string): Promise<YahooScreenerQuote[]> {
  try {
    const res = await yahooFinance.screener(
      { scrIds: scrId as never, count: ROSS_CANDIDATE_LIMIT },
      { validateResult: false } as never,
    );
    const quotes = (res as { quotes?: YahooScreenerQuote[] })?.quotes;
    return Array.isArray(quotes) ? quotes : [];
  } catch (e: unknown) {
    console.warn(`[ross/yahoo] screener ${scrId} failed:`, e instanceof Error ? e.message : e);
    return [];
  }
}

/** Fetch and merge candidates from the given Yahoo predefined screeners
 *  (defaults to the Ross small-cap set). */
export async function fetchYahooCandidates(
  scrIds: readonly string[] = SCR_IDS,
): Promise<RossCandidate[]> {
  const lists = await Promise.all(scrIds.map(fetchScreener));
  const seen = new Set<string>();
  const out: RossCandidate[] = [];

  for (const list of lists) {
    for (const q of list) {
      const ticker = (q.symbol ?? "").toUpperCase();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);

      const volume = num(q.regularMarketVolume);
      // Yahoo screener exposes 3-month / 10-day averages only (no true 30-day);
      // use the 3-month average as an approximate RVol proxy on this fallback path.
      const avgVol = num(q.averageDailyVolume3Month) ?? num(q.averageDailyVolume10Day);
      const relativeVolume =
        volume != null && avgVol != null && avgVol > 0 ? volume / avgVol : null;

      out.push({
        ticker,
        name: q.longName ?? q.shortName ?? ticker,
        exchange: null,
        price: num(q.regularMarketPrice),
        changePct: num(q.regularMarketChangePercent),
        relativeVolume,
        volume,
        avgVolume: avgVol,
        floatShares: null, // enriched later if possible
        marketCap: num(q.marketCap),
        premarketChangePct: num(q.preMarketChangePercent),
        postmarketChangePct: null,
        marketState: null,
        source: "yahoo",
      });
    }
  }
  return out;
}

/**
 * Best-effort float enrichment for a set of tickers via quoteSummary
 * defaultKeyStatistics.floatShares. Returns a map ticker → floatShares.
 * Missing/failed lookups are simply omitted. Bounded concurrency. Never throws.
 */
export async function enrichFloat(tickers: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const uniq = Array.from(new Set(tickers.map((t) => t.toUpperCase())));
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= uniq.length) return;
      const ticker = uniq[idx];
      try {
        const qs = await yahooFinance.quoteSummary(ticker, {
          modules: ["defaultKeyStatistics"],
        });
        const f = num((qs as { defaultKeyStatistics?: { floatShares?: number } })?.defaultKeyStatistics?.floatShares);
        if (f != null) map.set(ticker, f);
      } catch {
        // ignore — float stays N/A
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, uniq.length) }, () => worker()));
  return map;
}
