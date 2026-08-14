"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { ROSS_DEFAULTS } from "@/config/ross";
import { extendedDirectionControlCopy } from "@/lib/ross/presentation";
import type { RossResult } from "@/lib/ross/types";

// Adjustable 5-Pillar thresholds. Writes URL query params (?maxPrice=100…) so
// the screen re-runs server-side with the new band and the choice is shareable
// and survives refresh. Max-price has quick-pick chips per the user's request.

const MAX_PRICE_CHIPS = [20, 50, 100, 500];

type FieldKey = "maxPrice" | "minPrice" | "minChange" | "minRvol";

const FIELDS: { key: FieldKey; label: string; step: string; hint: string; def: number }[] = [
  { key: "maxPrice",  label: "Max price $", step: "0.5", hint: "Pillar 4",  def: ROSS_DEFAULTS.maxPrice },
  { key: "minPrice",  label: "Min price $", step: "0.5", hint: "Pillar 4",  def: ROSS_DEFAULTS.minPrice },
  { key: "minChange", label: "Min change %", step: "1",  hint: "Pillar 2",  def: ROSS_DEFAULTS.minChangePct },
  { key: "minRvol",   label: "Min RVol ×",  step: "0.5", hint: "Pillar 1",  def: ROSS_DEFAULTS.minRvol },
];

function currentValue(params: URLSearchParams, key: FieldKey, def: number): string {
  const v = params.get(key);
  return v != null && v !== "" ? v : String(def);
}

export function RossControls({
  marketSession,
  asOf,
}: {
  marketSession: RossResult["marketSession"];
  asOf: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const extCopy = extendedDirectionControlCopy(marketSession, asOf);

  const initial = useMemo(() => {
    const p = new URLSearchParams(searchParams?.toString() ?? "");
    return {
      maxPrice: currentValue(p, "maxPrice", ROSS_DEFAULTS.maxPrice),
      minPrice: currentValue(p, "minPrice", ROSS_DEFAULTS.minPrice),
      minChange: currentValue(p, "minChange", ROSS_DEFAULTS.minChangePct),
      minRvol: currentValue(p, "minRvol", ROSS_DEFAULTS.minRvol),
      maxFloatM: String(
        (Number(p.get("maxFloat")) || ROSS_DEFAULTS.maxFloat) / 1_000_000,
      ),
      extRising: p.get("extRising") !== "0",
    };
  }, [searchParams]);

  const [form, setForm] = useState(initial);

  // Re-sync the form when the URL query changes (Reset, Back/Forward, shared
  // link) — useState only seeds on mount, so without this the inputs would show
  // stale values and could re-apply them.
  useEffect(() => {
    setForm(initial);
  }, [initial]);

  function apply(next: typeof form) {
    const p = new URLSearchParams(searchParams?.toString() ?? "");
    p.set("maxPrice", next.maxPrice);
    p.set("minPrice", next.minPrice);
    p.set("minChange", next.minChange);
    p.set("minRvol", next.minRvol);
    const floatShares = Math.max(0, Number(next.maxFloatM) || 0) * 1_000_000;
    p.set("maxFloat", String(Math.round(floatShares)));
    if (next.extRising) p.delete("extRising");
    else p.set("extRising", "0");
    router.push(`/screener?${p.toString()}`);
  }

  function reset() {
    router.push("/screener");
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
          title="Reset to Ross defaults"
        >
          <RotateCcw className="w-3 h-3" /> Ross defaults
        </button>
      </div>

      {/* Max-price quick picks */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-[11px] subtle mr-1">Max price:</span>
        {MAX_PRICE_CHIPS.map((v) => {
          const active = Number(form.maxPrice) === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => {
                const next = { ...form, maxPrice: String(v) };
                setForm(next);
                apply(next);
              }}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                active
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-surface-2 hover:bg-surface-3 border-line"
              }`}
            >
              ${v}
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
            Max float (M) <span className="opacity-60">· Pillar 5</span>
          </span>
          <input
            type="number"
            step="1"
            value={form.maxFloatM}
            onChange={(e) => setField("maxFloatM", e.target.value)}
            className="text-sm bg-surface-2 border border-line rounded-md px-2 py-1 text-ink font-mono"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-[11px] text-ink cursor-pointer select-none mr-1">
          <input
            type="checkbox"
            checked={form.extRising}
            onChange={(e) => {
              const next = { ...form, extRising: e.target.checked };
              setForm(next);
              apply(next);
            }}
            className="accent-emerald-600"
          />
          <span className="font-medium">{extCopy.label}</span>
          <span className="opacity-60">{extCopy.hint}</span>
        </label>
        <button
          type="button"
          onClick={() => apply(form)}
          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition"
        >
          Apply thresholds
        </button>
        <span className="text-[11px] subtle">
          {extCopy.detail}
        </span>
      </div>
    </div>
  );
}
