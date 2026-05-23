import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { STOCK_TARGETS } from "@/config/stocks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const yahooFinance = new YahooFinance();
(yahooFinance as { suppressNotices?: (n: string[]) => void }).suppressNotices?.(["yahooSurvey", "ripHistorical"]);

export interface NewsItem {
  ticker: string;
  name: string;
  title: string;
  link: string;
  publisher?: string;
  publishedAt?: number;   // ms since epoch
}

interface CacheEntry { at: number; items: NewsItem[]; }
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
let cache: CacheEntry | null = null;

const PER_TICKER = 2;
const TOTAL_LIMIT = 30;

async function fetchTicker(ticker: string, name: string): Promise<NewsItem[]> {
  try {
    const res = await yahooFinance.search(ticker, { newsCount: PER_TICKER, quotesCount: 0 } as Parameters<typeof yahooFinance.search>[1]);
    const news = (res as { news?: Array<{ title?: string; link?: string; publisher?: string; providerPublishTime?: number | Date }> }).news ?? [];
    return news
      .filter((n) => n.title && n.link)
      .map((n) => ({
        ticker,
        name,
        title: n.title as string,
        link: n.link as string,
        publisher: n.publisher,
        publishedAt: n.providerPublishTime
          ? (n.providerPublishTime instanceof Date ? n.providerPublishTime.getTime() : Number(n.providerPublishTime) * (Number(n.providerPublishTime) < 1e12 ? 1000 : 1))
          : undefined,
      }));
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return NextResponse.json({ items: cache.items, asOf: new Date(cache.at).toISOString(), cached: true });
    }

    const results = await Promise.all(
      STOCK_TARGETS.map((t) => fetchTicker(t.ticker as string, t.name)),
    );

    // Dedupe by link, then sort by publishedAt desc.
    const seen = new Set<string>();
    const all: NewsItem[] = [];
    for (const list of results) {
      for (const item of list) {
        if (seen.has(item.link)) continue;
        seen.add(item.link);
        all.push(item);
      }
    }
    all.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
    const items = all.slice(0, TOTAL_LIMIT);

    cache = { at: Date.now(), items };
    return NextResponse.json({ items, asOf: new Date().toISOString(), cached: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "stock-news failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
