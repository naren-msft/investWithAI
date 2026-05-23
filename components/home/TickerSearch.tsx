"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface Entry {
  ticker: string;
  name: string;
  role: string;
  kind: "etf" | "stocks";
  href: string;
}

export function TickerSearch() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/home/holdings")
      .then((r) => r.json())
      .then((d) => Array.isArray(d?.entries) && setEntries(d.entries))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const q = query.trim().toLowerCase();
  const results: Entry[] = q
    ? entries
        .map((e) => {
          const t = e.ticker.toLowerCase();
          const n = e.name.toLowerCase();
          const r = e.role.toLowerCase();
          let score = -1;
          if (t === q) score = 100;
          else if (t.startsWith(q)) score = 80;
          else if (t.includes(q)) score = 60;
          else if (n.startsWith(q)) score = 50;
          else if (n.includes(q)) score = 30;
          else if (r.includes(q)) score = 10;
          return { entry: e, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((x) => x.entry)
    : [];

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  function go(entry: Entry) {
    setOpen(false);
    setQuery("");
    router.push(entry.href);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[highlight];
      if (pick) go(pick);
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-xl mx-auto">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 subtle pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Jump to ticker… (⌘K)"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKey}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60"
        />
      </div>

      {open && query && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-line bg-card shadow-lg overflow-hidden">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm subtle">No matches in your portfolios.</div>
          ) : (
            <ul className="max-h-80 overflow-auto">
              {results.map((entry, idx) => (
                <li key={`${entry.kind}:${entry.ticker}`}>
                  <button
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => go(entry)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 ${
                      idx === highlight ? "bg-card-soft" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{entry.ticker}</div>
                      <div className="text-xs subtle truncate">{entry.name} · {entry.role}</div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${
                        entry.kind === "etf"
                          ? "border-indigo-500/40 text-indigo-700 dark:text-indigo-300 bg-indigo-500/10"
                          : "border-fuchsia-500/40 text-fuchsia-700 dark:text-fuchsia-300 bg-fuchsia-500/10"
                      }`}
                    >
                      {entry.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
