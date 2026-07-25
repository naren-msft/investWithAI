"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RefreshCw } from "lucide-react";

type Interval = 30 | 60 | 120 | 300;

const KEY_ENABLED  = "investai.autorefresh.enabled";
const KEY_INTERVAL = "investai.autorefresh.interval";

export function AutoRefresh() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [interval, setIntervalSec] = useState<Interval>(60);
  const [countdown, setCountdown] = useState(60);
  const [mounted, setMounted] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // useTransition lets router.refresh() swap the RSC payload *without*
  // unmounting the current subtree — eliminates the visible flicker on
  // charts / tables every minute. `isPending` doubles as our "refreshing"
  // indicator for the spinner.
  const [isPending, startTransition] = useTransition();

  // Hydrate from localStorage once on mount.
  useEffect(() => {
    try {
      const e = localStorage.getItem(KEY_ENABLED);
      const i = localStorage.getItem(KEY_INTERVAL);
      if (e !== null) setEnabled(e === "true");
      if (i !== null) {
        const n = Number(i) as Interval;
        if ([30, 60, 120, 300].includes(n)) setIntervalSec(n);
      }
    } catch {}
    setMounted(true);
  }, []);

  // Persist toggles.
  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(KEY_ENABLED, String(enabled)); } catch {}
  }, [enabled, mounted]);
  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(KEY_INTERVAL, String(interval)); } catch {}
  }, [interval, mounted]);

  // Drive the countdown + refresh loop.
  useEffect(() => {
    if (!enabled) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      setCountdown(interval);
      return;
    }
    setCountdown(interval);
    tickRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          startTransition(() => router.refresh());
          return interval;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [enabled, interval, router]);

  function refreshNow() {
    startTransition(() => router.refresh());
    setCountdown(interval);
  }

  if (!mounted) return null;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 text-xs px-2 py-1">
      <button
        type="button"
        onClick={refreshNow}
        title="Refresh now"
        className={`inline-flex items-center justify-center w-5 h-5 hover:text-brand transition-colors ${isPending ? "text-brand" : ""}`}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
      </button>
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        title={enabled ? "Pause auto-refresh" : "Resume auto-refresh"}
        className="inline-flex items-center justify-center w-5 h-5 hover:text-brand transition-colors"
      >
        {enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>
      <select
        value={interval}
        onChange={(e) => setIntervalSec(Number(e.target.value) as Interval)}
        className="bg-transparent text-xs subtle border-0 focus:outline-none cursor-pointer"
        title="Refresh interval"
      >
        <option value={30}>30s</option>
        <option value={60}>1m</option>
        <option value={120}>2m</option>
        <option value={300}>5m</option>
      </select>
      <span className="subtle font-mono tabular-nums w-7 text-right">
        {enabled ? `${countdown}s` : "off"}
      </span>
    </div>
  );
}
