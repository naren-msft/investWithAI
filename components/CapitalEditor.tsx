"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { fmtUsd } from "@/lib/format";

const LS_CAPITAL = "investai.capital";
const LS_BUFFER = "investai.cashBuffer";

/**
 * Inline editor for total capital and reserved cash buffer. Persists the
 * user's choice to localStorage and pushes it onto the URL as
 * `?capital=…&buffer=…` so the server pipeline re-runs with the override
 * and every derived card (deployment plan, tranches, sizing, %s) updates.
 *
 * `scope` namespaces the localStorage keys so independent portfolios
 * (e.g. /etf vs /stocks) don't clobber each other's saved sizing.
 *
 * Reads the current URL via `window.location` (not `useSearchParams`) to
 * sidestep Next 14's Suspense requirement.
 */
export function CapitalEditor({ capital, cashBuffer, scope = "etf" }: { capital: number; cashBuffer: number; scope?: string }) {
  const router = useRouter();
  const lsCapKey = `${LS_CAPITAL}.${scope}`;
  const lsBufKey = `${LS_BUFFER}.${scope}`;

  const [open, setOpen] = useState(false);
  const [capitalInput, setCapitalInput] = useState(String(capital));
  const [bufferInput, setBufferInput] = useState(String(cashBuffer));
  const [error, setError] = useState<string | null>(null);
  const [hasOverride, setHasOverride] = useState(false);

  // On first mount: if URL has no override but localStorage does, apply it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const urlCap = url.searchParams.get("capital");
      const urlBuf = url.searchParams.get("buffer");
      setHasOverride(!!urlCap || !!urlBuf);
      if (urlCap || urlBuf) return;
      const lsCap = Number(localStorage.getItem(lsCapKey) ?? "");
      const lsBuf = Number(localStorage.getItem(lsBufKey) ?? "");
      if (Number.isFinite(lsCap) && lsCap > 0) {
        const params = new URLSearchParams();
        params.set("capital", String(Math.round(lsCap)));
        if (Number.isFinite(lsBuf) && lsBuf >= 0) params.set("buffer", String(Math.round(lsBuf)));
        router.replace(`?${params.toString()}`);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCapitalInput(String(capital));
    setBufferInput(String(cashBuffer));
  }, [capital, cashBuffer]);

  function commit() {
    const c = Math.round(Number(capitalInput));
    const b = Math.round(Number(bufferInput));
    if (!Number.isFinite(c) || c <= 0) {
      setError("Capital must be a positive number.");
      return;
    }
    if (!Number.isFinite(b) || b < 0) {
      setError("Cash buffer must be zero or positive.");
      return;
    }
    if (b > c) {
      setError("Cash buffer can't exceed total capital.");
      return;
    }
    try {
      localStorage.setItem(lsCapKey, String(c));
      localStorage.setItem(lsBufKey, String(b));
    } catch {}
    const params = new URLSearchParams();
    params.set("capital", String(c));
    params.set("buffer", String(b));
    setError(null);
    setOpen(false);
    setHasOverride(true);
    router.replace(`?${params.toString()}`);
    router.refresh();
  }

  function cancel() {
    setCapitalInput(String(capital));
    setBufferInput(String(cashBuffer));
    setError(null);
    setOpen(false);
  }

  function reset() {
    try {
      localStorage.removeItem(lsCapKey);
      localStorage.removeItem(lsBufKey);
    } catch {}
    setError(null);
    setOpen(false);
    setHasOverride(false);
    router.replace("?");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 hover:bg-surface-3 text-xs px-2 py-1"
        title="Edit total capital & cash buffer"
      >
        <Pencil className="w-3 h-3" />
        <span className="hidden sm:inline">Edit sizing</span>
        <span className="font-mono">{fmtUsd(capital)}</span>
        {hasOverride && (
          <span className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            custom
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1 text-[11px] subtle">
          Capital&nbsp;$
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1000}
            value={capitalInput}
            onChange={(e) => setCapitalInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="w-28 rounded border border-line bg-surface px-1.5 py-0.5 text-xs font-mono"
          />
        </label>
        <label className="inline-flex items-center gap-1 text-[11px] subtle">
          Buffer&nbsp;$
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={bufferInput}
            onChange={(e) => setBufferInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="w-24 rounded border border-line bg-surface px-1.5 py-0.5 text-xs font-mono"
          />
        </label>
        <button
          type="button"
          onClick={commit}
          className="inline-flex items-center gap-1 rounded border border-emerald-600 bg-emerald-600 text-white dark:bg-emerald-500 dark:border-emerald-400 dark:text-black text-[11px] px-1.5 py-0.5"
          title="Save"
        >
          <Check className="w-3 h-3" /> Save
        </button>
        <button
          type="button"
          onClick={cancel}
          className="inline-flex items-center gap-1 rounded border border-line bg-surface hover:bg-surface-3 text-[11px] px-1.5 py-0.5"
          title="Cancel"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
        {hasOverride && (
          <button
            type="button"
            onClick={reset}
            className="text-[11px] underline subtle"
            title="Clear override and use the default"
          >
            reset
          </button>
        )}
      </div>
      {error && <div className="text-[11px] text-red-700 dark:text-red-300">{error}</div>}
    </div>
  );
}

