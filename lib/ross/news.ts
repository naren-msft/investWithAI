import YahooFinance from "yahoo-finance2";
import {
  ROSS_NEWS_PER_TICKER,
  ROSS_NEWS_POSITIVE_ONLY,
} from "@/config/ross";
import type { RossNewsItem } from "./types";
import { scoreSentiment, isGenericHeadline } from "./sentiment";
import { fetchFinnhubNews, finnhubEnabled } from "./finnhub";

// Per-ticker catalyst-news fetcher. Two keyless sources are merged:
//
//   1. Yahoo Finance RSS headline feed — includes a <description> summary,
//      <pubDate> timestamp and <source>, which the search API does not.
//   2. Yahoo Finance `search` news — broader coverage, good for tickers with a
//      thin RSS feed.
//
// Ross buys strength on a positive catalyst, so headlines are scored for
// bullish/bearish tone (lib/ross/sentiment) and — in positive-only mode —
// only up-move news survives. Items are kept only if published within the
// after-hours + overnight + pre-market catalyst window. Never throws.

const yahooFinance = new YahooFinance();
(yahooFinance as { suppressNotices?: (n: string[]) => void }).suppressNotices?.(["yahooSurvey", "ripHistorical"]);

const RSS_TIMEOUT_MS = 6000;

interface YahooNews {
  title?: string;
  link?: string;
  publisher?: string;
  providerPublishTime?: number | Date;
  summary?: string;
}

function toMs(v: number | Date | undefined): number | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return v.getTime();
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n < 1e12 ? n * 1000 : n;
}

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? stripTags(m[1]) : undefined;
}

/** Classify a headline time (ET) into the trading window it lands in. */
function classifyWindow(ms?: number): RossNewsItem["window"] {
  if (ms == null) return undefined;
  const et = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const hour = Number(et.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(et.find((p) => p.type === "minute")?.value ?? "0");
  const t = hour * 60 + minute;
  if (t >= 16 * 60 && t < 20 * 60) return "afterhours";   // 4:00pm–8:00pm
  if (t >= 20 * 60 || t < 4 * 60) return "overnight";      // 8:00pm–4:00am
  if (t >= 4 * 60 && t < 9 * 60 + 30) return "premarket";  // 4:00am–9:30am
  return "regular";
}

/** Fetch Yahoo's RSS headline feed for a ticker (summary + source + pubDate). */
async function fetchRss(ticker: string): Promise<RossNewsItem[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
    ticker,
  )}&region=US&lang=en-US`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; investWithAI/1.0)" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
    const out: RossNewsItem[] = [];
    for (const block of items) {
      const title = tag(block, "title");
      const link = tag(block, "link");
      if (!title || !link) continue;
      const pub = tag(block, "pubDate");
      const publishedAt = pub ? Date.parse(pub) : undefined;
      out.push({
        title,
        link,
        publisher: tag(block, "source") || undefined,
        publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
        summary: tag(block, "description") || undefined,
        source: "yahoo",
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch Yahoo `search` news for a ticker. */
async function fetchSearch(ticker: string): Promise<RossNewsItem[]> {
  try {
    const res = await yahooFinance.search(
      ticker,
      { newsCount: ROSS_NEWS_PER_TICKER + 6, quotesCount: 0 } as Parameters<typeof yahooFinance.search>[1],
    );
    const news = (res as { news?: YahooNews[] }).news ?? [];
    return news
      .filter((n) => n.title && n.link)
      .map<RossNewsItem>((n) => ({
        title: n.title as string,
        link: n.link as string,
        publisher: n.publisher,
        publishedAt: toMs(n.providerPublishTime),
        summary: n.summary,
        source: "yahoo",
      }));
  } catch (e: unknown) {
    console.warn(`[ross/news] search ${ticker} failed:`, e instanceof Error ? e.message : e);
    return [];
  }
}

async function fetchTickerNews(ticker: string, sinceMs: number): Promise<RossNewsItem[]> {
  const [finnhub, rss, search] = await Promise.all([
    fetchFinnhubNews(ticker, sinceMs), // real-time source (no-op without a key)
    fetchRss(ticker),
    fetchSearch(ticker),
  ]);

  // Merge + dedupe by normalized title. Finnhub is listed first so its precise
  // minute-level timestamp + summary win; later sources only FILL missing fields
  // (a field-wise merge — a plain spread would let a later `undefined` erase an
  // existing summary/timestamp).
  const byKey = new Map<string, RossNewsItem>();
  for (const item of [...finnhub, ...rss, ...search]) {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    byKey.set(key, {
      ...existing,
      summary: existing.summary ?? item.summary,
      publishedAt: existing.publishedAt ?? item.publishedAt,
      publisher: existing.publisher ?? item.publisher,
      link: existing.link ?? item.link,
    });
  }

  const scored = Array.from(byKey.values())
    // Time window: keep items at/after the cutoff and not in the future (a small
    // clock-skew allowance guards against a slightly-ahead source clock). Items
    // with no timestamp are dropped (avoids surfacing stale evergreen links).
    .filter((n) => n.publishedAt != null && n.publishedAt >= sinceMs && n.publishedAt <= Date.now() + 5 * 60 * 1000)
    // Drop generic market-roundup / list headlines (not a real catalyst).
    .filter((n) => !isGenericHeadline(n.title))
    .map((n) => {
      const s = scoreSentiment(n.title, n.summary);
      return { ...n, sentimentScore: s.score, window: classifyWindow(n.publishedAt), _neg: s.negative };
    })
    // Positive-only mode: keep only strictly-bullish headlines (drop neutral +
    // negative). This is the "strong positive news moving it up" the screen wants.
    .filter((n) => (ROSS_NEWS_POSITIVE_ONLY ? (n.sentimentScore ?? 0) > 0 : !n._neg));

  // Sort: most-recent first (freshest catalyst wins), then most-positive.
  scored.sort((a, b) => {
    if ((b.publishedAt ?? 0) !== (a.publishedAt ?? 0)) return (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
    return (b.sentimentScore ?? 0) - (a.sentimentScore ?? 0);
  });

  return scored.slice(0, ROSS_NEWS_PER_TICKER).map(({ _neg, ...rest }) => rest);
}

async function withConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * Fetch positive catalyst news for a batch of tickers, keeping only items
 * published at/after `since` (the rolling catalyst-window start), newest-first.
 * Returns ticker → items.
 */
export async function fetchRossNews(
  tickers: string[],
  since: Date,
): Promise<Map<string, RossNewsItem[]>> {
  const sinceMs = since.getTime();
  const uniq = Array.from(new Set(tickers.map((t) => t.toUpperCase())));
  const lists = await withConcurrency(uniq, 6, (t) => fetchTickerNews(t, sinceMs));
  const map = new Map<string, RossNewsItem[]>();
  uniq.forEach((t, i) => map.set(t, lists[i] ?? []));
  return map;
}

/** Human-readable label for the currently active news source(s). */
export function activeNewsSourceLabel(): string {
  return finnhubEnabled() ? "Finnhub (real-time) + Yahoo" : "Yahoo Finance";
}
