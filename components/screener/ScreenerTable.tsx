"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { GateBreakdown } from "./GateBreakdown";
import type { ScreenerResult, ScreenerRow } from "@/lib/screener/types";
import type { ThemeTag } from "@/config/screener-themes";

type Filter = "all" | "passed" | "core" | "emerging" | "venture";

const TAG_BADGE: Record<ThemeTag, "info" | "warn" | "danger"> = {
  core: "info",
  emerging: "warn",
  venture: "danger",
};

function gatePill(passed: boolean, label: string) {
  return (
    <Badge variant={passed ? "success" : "default"}>{label}</Badge>
  );
}

function fmtTrancheSplit(tag: ThemeTag): string {
  return tag === "core" ? "50/25/25" : tag === "emerging" ? "40/30/30" : "33/33/33";
}

export function ScreenerTable({ result }: { result: ScreenerResult }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [theme, setTheme] = useState<string>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    let r = result.rows;
    if (filter === "passed") r = r.filter((x) => x.passedAll);
    else if (filter !== "all") r = r.filter((x) => x.tag === filter);
    if (theme !== "all") r = r.filter((x) => x.primaryTheme === theme || x.secondaryThemes.includes(theme as any));
    return r;
  }, [result.rows, filter, theme]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1">
          {(["all", "passed", "core", "emerging", "venture"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                filter === f
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-surface-2 hover:bg-surface-3 border-line"
              }`}
            >
              {f === "passed" ? "Pass all 3 gates" : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs subtle">Theme:</label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="text-xs bg-surface-2 border border-line rounded-md px-2 py-1"
          >
            <option value="all">All themes</option>
            {result.themes.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-ink/80">
            <tr>
              <th className="text-left px-2 py-2 w-6"></th>
              <th className="text-left px-2 py-2">Ticker</th>
              <th className="text-left px-2 py-2 hidden md:table-cell">Name</th>
              <th className="text-left px-2 py-2">Theme</th>
              <th className="text-left px-2 py-2">Tag</th>
              <th className="text-center px-2 py-2">G1 Fund</th>
              <th className="text-center px-2 py-2">G2 Moat</th>
              <th className="text-center px-2 py-2">G3 Trend</th>
              <th className="text-right px-2 py-2">Confidence</th>
              <th className="text-left px-2 py-2 hidden lg:table-cell">Tranches</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-2 py-6 text-center subtle">
                  No tickers match this filter.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isOpen = open[row.ticker] ?? false;
              return (
                <Row
                  key={row.ticker}
                  row={row}
                  isOpen={isOpen}
                  onToggle={() => setOpen((s) => ({ ...s, [row.ticker]: !s[row.ticker] }))}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] subtle mt-2">
        Click any row to see the per-gate breakdown and confidence components.
      </p>
    </div>
  );
}

function Row({
  row,
  isOpen,
  onToggle,
}: {
  row: ScreenerRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-t border-line hover:bg-surface-2/60 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-2 py-2 align-middle">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </td>
        <td className="px-2 py-2 font-mono font-semibold text-ink">{row.ticker}</td>
        <td className="px-2 py-2 hidden md:table-cell">{row.name}</td>
        <td className="px-2 py-2">
          <div className="text-ink/90">{row.primaryThemeLabel}</div>
          {row.secondaryThemes.length > 0 && (
            <div className="text-[10px] subtle">+ {row.secondaryThemes.length} more</div>
          )}
        </td>
        <td className="px-2 py-2">
          <Badge variant={TAG_BADGE[row.tag]}>{row.tag}</Badge>
        </td>
        <td className="px-2 py-2 text-center">{gatePill(row.gate1.passed, row.gate1.score.toFixed(0))}</td>
        <td className="px-2 py-2 text-center">{gatePill(row.gate2.passed, row.gate2.score.toFixed(0))}</td>
        <td className="px-2 py-2 text-center">{gatePill(row.gate3.passed, row.gate3.score.toFixed(0))}</td>
        <td className="px-2 py-2 text-right">
          <ConfidenceBadge score={row.confidence} />
        </td>
        <td className="px-2 py-2 hidden lg:table-cell font-mono text-[11px]">
          {fmtTrancheSplit(row.tag)}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-t border-line bg-surface-2/30">
          <td colSpan={10} className="px-3 py-3">
            <GateBreakdown row={row} />
          </td>
        </tr>
      )}
    </>
  );
}
