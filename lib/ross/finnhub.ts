import type { RossNewsItem } from "./types";

// Optional Finnhub company-news source for near-real-time, minute-level
// breaking headlines. Activated only when FINNHUB_API_KEY is set — otherwise
// every function is a no-op and the screener falls back to Yahoo transparently.
//
// Free tier includes `company-news` (60 req/min). Docs:
//   https://finnhub.io/docs/api/company-news
// Never throws.

const BASE = "https://finnhub.io/api/v1/company-news";
const TIMEOUT_MS = 6000;

/** True when a Finnhub API key is configured (server-side env). */
export function finnhubEnabled(): boolean {
  return !!process.env.FINNHUB_API_KEY;
}

interface FinnhubNews {
  category?: string;
  datetime?: number; // unix seconds
  headline?: string;
  id?: number;
  source?: string;
  summary?: string;
  url?: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * Fetch Finnhub company news for a ticker within [sinceMs, now]. Returns
 * normalized RossNewsItem[] (empty when disabled / on any failure).
 */
export async function fetchFinnhubNews(ticker: string, sinceMs: number): Promise<RossNewsItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];

  // Finnhub filters by calendar date; widen the `from` by a day so nothing in
  // the rolling window is missed at the UTC-date boundary. Exact ms filtering
  // happens downstream in news.ts.
  const from = ymd(new Date(sinceMs - 24 * 60 * 60 * 1000));
  const to = ymd(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const url = `${BASE}?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${encodeURIComponent(key)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.warn("[ross/finnhub] auth failed — check FINNHUB_API_KEY");
      } else if (res.status === 429) {
        console.warn("[ross/finnhub] rate limited (429)");
      }
      return [];
    }
    const json = (await res.json()) as FinnhubNews[];
    if (!Array.isArray(json)) return [];
    return json
      .filter((n) => n.headline && n.url)
      .map<RossNewsItem>((n) => ({
        title: n.headline as string,
        link: n.url as string,
        publisher: n.source || undefined,
        publishedAt: n.datetime != null ? n.datetime * 1000 : undefined,
        summary: n.summary || undefined,
        source: "finnhub",
      }));
  } catch (e: unknown) {
    console.warn(`[ross/finnhub] ${ticker} failed:`, e instanceof Error ? e.message : e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
