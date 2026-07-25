"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { LARGECAP_DEFAULTS } from "@/config/largecap";

// Adjustable 5-Pillar thresholds for the LARGE-CAP screener. Writes URL query
// params (?minMarketCap=…) so the screen re-runs server-side and the choice is
// shareable + survives refresh. Min-market-cap has quick-pick chips ($B).

const MIN_MCAP_CHIPS_B = [10, 50, 200, 1000]; // $B: large / mega / top-tier

type FieldKey = "maxPrice" | "minPrice" | "minChange" | "minRvol";

const FIELDS: { key: FieldKey; label: string; step: string; hint: string; def: number }[] = [
  { key: "maxPrice",  label: "Max price $", step: "1",   hint: "Pillar 4", def: LARGECAP_DEFAULTS.maxPrice },
  { key: "minPrice",  label: "Min price $", step: "1",   hint: "Pillar 4", def: LARGECAP_DEFAULTS.minPrice },
  { key: "minChange", label: "Min change %", step: "0.5", hint: "Pillar 2", def: LARGECAP_DEFAULTS.minChangePct },
  { key: "minRvol",   label: "Min RVol ×",  step: "0.1", hint: "Pillar 1", def: LARGECAP_DEFAULTS.minRvol },
];

function currentValue(params: URLSearchParams, key: FieldKey, def: number): string {
  const v = params.get(key);
  return v != null && v !== "" ? v : String(def);
}

export function LargecapControls() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initial = useMemo(() => {
    const p = new URLSearchParams(searchParams?.toString() ?? "");
    // Explicit-presence check (not `|| default`) so a legitimate 0 floor is kept.
    const rawMcap = p.get("minMarketCap");
    const mcap = rawMcap != null && rawMcap !== "" && Number.isFinite(Number(rawMcap))
      ? Number(rawMcap)
      : LARGECAP_DEFAULTS.minMarketCap;
    return {
      maxPrice: currentValue(p, "maxPrice", LARGECAP_DEFAULTS.maxPrice),
      minPrice: currentValue(p, "minPrice", LARGECAP_DEFAULTS.minPrice),
      minChange: currentValue(p, "minChange", LARGECAP_DEFAULTS.minChangePct),
      minRvol: currentValue(p, "minRvol", LARGECAP_DEFAULTS.minRvol),
      minMarketCapB: String(mcap / 1_000_000_000),
    };
  }, [searchParams]);

  const [form, setForm] = useState(initial);

  // Re-sync the form when the URL query changes (Reset, Back/Forward, shared
  // link) — useState only seeds on mount.
  useEffect(() => {
    setForm(initial);
  }, [initial]);

  function apply(next: typeof form) {
    const p = new URLSearchParams(searchParams?.toString() ?? "");
    p.set("book", "large");
    p.set("maxPrice", next.maxPrice);
    p.set("minPrice", next.minPrice);
    p.set("minChange", next.minChange);
    p.set("minRvol", next.minRvol);
    const marketCap = Math.max(0, Number(next.minMarketCapB) || 0) * 1_000_000_000;
    p.set("minMarketCap", String(Math.round(marketCap)));
    router.push(`/screener?${p.toString()}`);
  }

  function reset() {
    router.push("/screener?book=large");
  }

  const setField = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <SlidersHorizontal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm font-semibold text-ink">Adjust the 5-Pillar thresholds</span>
        <button
          type="button"
          onClick={reset}
          className="ml-auto inline-flex items-center gap-1 text-[11px] subtle hover:text-ink transition"
          title="Reset to large-cap defaults"
        >
          <RotateCcw className="w-3 h-3" /> Large-cap defaults
        </button>
      </div>

      {/* Min-market-cap quick picks */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-[11px] subtle mr-1">Min market cap:</span>
        {MIN_MCAP_CHIPS_B.map((v) => {
          const active = Number(form.minMarketCapB) === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => {
                const next = { ...form, minMarketCapB: String(v) };
                setForm(next);
                apply(next);
              }}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                active
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-surface-2 hover:bg-surface-3 border-line"
              }`}
            >
              ${v}B
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-[11px] subtle flex flex-col gap-1">
            <span>
              {f.label} <span className="opacity-60">· {f.hint}</span>
            </span>
            <input
              type="number"
              step={f.step}
              value={form[f.key]}
              onChange={(e) => setField(f.key, e.target.value)}
              className="text-sm bg-surface-2 border border-line rounded-md px-2 py-1 text-ink font-mono"
            />
          </label>
        ))}
        <label className="text-[11px] subtle flex flex-col gap-1">
          <span>
            Min mkt cap ($B) <span className="opacity-60">· Pillar 5</span>
          </span>
          <input
            type="number"
            step="1"
            value={form.minMarketCapB}
            onChange={(e) => setField("minMarketCapB", e.target.value)}
            className="text-sm bg-surface-2 border border-line rounded-md px-2 py-1 text-ink font-mono"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => apply(form)}
          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition"
        >
          Apply thresholds
        </button>
        <span className="text-[11px] subtle">
          Applied server-side to the scanner — price band, RVol, change % and market cap.
        </span>
      </div>
    </div>
  );
}
