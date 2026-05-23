"use client";

import { useEffect, useMemo, useState } from "react";
import { Newspaper, ExternalLink, RefreshCw } from "lucide-react";

interface NewsItem {
  ticker: string;
  name: string;
  title: string;
  link: string;
  publisher?: string;
  publishedAt?: number;
}

function timeAgo(ms?: number): string {
  if (!ms) return "";
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function StockNews() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  async function load() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/home/stock-news").then((r) => r.json());
      if (res?.error) setError(res.error);
      else { setItems(res.items ?? []); setError(null); }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => clearInterval(id);
  }, []);

  const tickers = useMemo(() => {
    if (!items) return [];
    return Array.from(new Set(items.map((x) => x.ticker)));
  }, [items]);

  const visible = items
    ? (filter === "all" ? items : items.filter((x) => x.ticker === filter))
    : [];

  return (
    <section className="rounded-xl border border-line bg-card p-4 md:p-5">
      <header className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-sky-500" />
          <h2 className="font-semibold text-sm md:text-base">Stock news</h2>
          <span className="text-xs subtle">
            {items === null ? "loading…" : `${items.length} headlines for your holdings`}
          </span>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="flex items-center gap-1 text-xs subtle hover:text-ink transition disabled:opacity-50"
          aria-label="Refresh news"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      {items && items.length > 0 && tickers.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
          {tickers.map((t) => (
            <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>{t}</Chip>
          ))}
        </div>
      )}

      {items === null && !error && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-card-soft animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 py-4 text-center">
          Error: {error}
        </div>
      )}

      {items && items.length === 0 && !error && (
        <p className="text-sm subtle py-6 text-center">No fresh headlines available right now.</p>
      )}

      {visible.length > 0 && (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {visible.map((n) => (
            <li key={n.link}>
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-lg border border-line bg-card-soft hover:bg-card-soft/70 hover:border-sky-500/40 p-3 transition"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/30">
                    {n.ticker}
                  </span>
                  <span className="text-[11px] subtle truncate">{n.publisher ?? "—"}</span>
                  {n.publishedAt && (
                    <span className="text-[11px] subtle ml-auto whitespace-nowrap">{timeAgo(n.publishedAt)}</span>
                  )}
                </div>
                <div className="text-sm font-medium leading-snug group-hover:text-sky-600 dark:group-hover:text-sky-400 line-clamp-3">
                  {n.title}
                  <ExternalLink className="inline w-3 h-3 ml-1 -mt-0.5 opacity-60" />
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2 py-0.5 rounded-md border transition ${
        active ? "bg-ink text-bg border-ink" : "border-line hover:bg-card-soft"
      }`}
    >
      {children}
    </button>
  );
}
