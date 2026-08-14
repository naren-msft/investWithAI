"use client";

import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  BarChart2,
  Flame,
  Newspaper,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { IntradayChart } from "@/components/IntradayChart";
import { Badge } from "@/components/ui/Badge";
import { clsx } from "@/components/ui/cn";
import {
  aggregateNews,
  applyDashboardFilter,
  continuationRows,
  type DashboardFilter,
  firstQualifiedSeenAt,
  firstWatchSeenAt,
  freshStatus,
  filteredHighOfDayRows,
  type HighOfDayFilter,
  summarizePillars,
} from "@/lib/ross/dashboardHelpers";
import {
  extendedHoursDisplayCopy,
  risingExtendedLabel,
} from "@/lib/ross/presentation";
import type {
  RossNewsItem,
  RossResult,
  RossRow,
} from "@/lib/ross/types";

const NEWS_FRESH_MS = 3 * 60 * 60 * 1_000;
const REFRESH_INTERVAL_OPTIONS: Array<{
  label: string;
  sec: number;
}> = [
  { label: "30s", sec: 30 },
  { label: "1m", sec: 60 },
  { label: "5m", sec: 300 },
  { label: "Off", sec: 0 },
];

const HOD_FILTER_OPTIONS: Array<{
  key: HighOfDayFilter;
  label: string;
  activeClass: string;
}> = [
  {
    key: "all",
    label: "All",
    activeClass:
      "border-orange-500 bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  {
    key: "green",
    label: "Green",
    activeClass:
      "border-emerald-500 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  },
  {
    key: "watch",
    label: "Watch",
    activeClass:
      "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300",
  },
  {
    key: "rising",
    label: "Rising",
    activeClass:
      "border-sky-500 bg-sky-500/20 text-sky-700 dark:text-sky-300",
  },
];

const STATUS_BUTTON_STYLES = {
  default: "bg-surface-3 text-ink border-line",
  success:
    "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-500 dark:border-emerald-400 dark:text-black",
  warn:
    "bg-amber-500 text-white border-amber-600 dark:bg-amber-400 dark:border-amber-300 dark:text-black",
  info:
    "bg-sky-600 text-white border-sky-700 dark:bg-sky-500 dark:border-sky-400 dark:text-white",
} as const;

const WINDOW_LABEL: Record<
  NonNullable<RossNewsItem["window"]>,
  string
> = {
  afterhours: "After-hours",
  overnight: "Overnight",
  premarket: "Pre-market",
  regular: "Regular",
};

const FILTER_OPTIONS: Array<{
  key: DashboardFilter;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "green", label: "Green" },
  { key: "watch", label: "Watch" },
  { key: "strong", label: "Strong" },
  { key: "rising", label: "Rising" },
  { key: "news", label: "News" },
];

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function fmtRvol(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}×`;
}

function fmtPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  return `$${value.toFixed(2)}`;
}

function fmtShares(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return String(Math.round(value));
}

function fmtMarketCap(value: number | null | undefined): string {
  const shares = fmtShares(value);
  return shares === "—" ? "—" : `$${shares}`;
}

function fmtEtTime(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function timeAgo(
  timestamp?: number,
  referenceMs: number = Date.now(),
): string {
  if (!timestamp) return "";
  const seconds = Math.max(
    1,
    Math.round((referenceMs - timestamp) / 1_000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function referenceMs(asOf: string): number {
  const parsed = Date.parse(asOf);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function rowPrice(row: RossRow): number | null | undefined {
  return row.currentPrice ?? row.candidate.price;
}

function rowChangePct(row: RossRow): number | null | undefined {
  return row.currentChangePct ?? row.candidate.changePct;
}

function isFreshNews(
  timestamp?: number,
  refMs: number = Date.now(),
): boolean {
  return (
    timestamp != null &&
    refMs - timestamp <= NEWS_FRESH_MS
  );
}

function newsTone(item: RossNewsItem): {
  label: string;
  className: string;
} | null {
  if (typeof item.sentimentScore !== "number") return null;
  if (item.sentimentScore > 0) {
    return {
      label: "Bullish",
      className:
        "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    };
  }
  return {
    label: "Neutral",
    className:
      "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  };
}

function rowTimeMeta(row: RossRow): {
  label: string;
  value: string;
  title: string;
} | null {
  const firstWatchAt = firstWatchSeenAt(row);
  const firstQualifiedAt = firstQualifiedSeenAt(row);

  if (row.stage === "watch" && firstWatchAt) {
    return {
      label: "Watch",
      value: fmtEtTime(firstWatchAt),
      title: [
        `First seen as watch ${fmtEtTime(firstWatchAt)} ET`,
        row.firstQualifiedAt
          ? `Qualified earlier ${fmtEtTime(row.firstQualifiedAt)} ET`
          : "Not yet qualified",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  if (firstQualifiedAt) {
    return {
      label: "Qual",
      value: fmtEtTime(firstQualifiedAt),
      title: [
        firstWatchAt &&
        firstWatchAt !== firstQualifiedAt
          ? `First seen as watch ${fmtEtTime(firstWatchAt)} ET`
          : null,
        `First qualified ${fmtEtTime(firstQualifiedAt)} ET`,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  if (row.firstSeenAt) {
    return {
      label: "Seen",
      value: fmtEtTime(row.firstSeenAt),
      title: `First seen ${fmtEtTime(row.firstSeenAt)} ET`,
    };
  }
  return null;
}

function alignmentSummary(row: RossRow): string {
  if (!row.signalAlignment || row.stage !== "qualified") {
    return row.stage === "watch" ? "Watch" : "—";
  }
  const unknown =
    row.signalAlignment.total - row.signalAlignment.knownCount;
  return `${row.signalAlignment.alignedCount}/${row.signalAlignment.total}${
    unknown > 0 ? "?" : ""
  }`;
}

function alignmentTitle(row: RossRow): string | undefined {
  if (!row.signalAlignment || row.stage !== "qualified") {
    return row.stage === "watch"
      ? "Early watch mover — waiting for a qualified continuation read"
      : undefined;
  }
  return row.signalAlignment.signals
    .map(
      (signal) =>
        `${signal.label}: ${
          signal.state === "aligned"
            ? "aligned"
            : signal.state === "not-aligned"
              ? "not aligned"
              : "unknown"
        }`,
    )
    .join(" · ");
}

function accelerationLines(row: RossRow): string[] {
  const lines: string[] = [];
  if (row.rvolDelta != null) {
    lines.push(
      `RVol ${
        row.rvolDelta > 0 ? "+" : ""
      }${row.rvolDelta.toFixed(1)}×`,
    );
  }
  if (row.changeDelta != null) {
    lines.push(
      `Chg ${
        row.changeDelta > 0 ? "+" : ""
      }${row.changeDelta.toFixed(1)}pt`,
    );
  }
  if (lines.length === 0 && row.accelScore != null) {
    lines.push(
      `Score ${
        row.accelScore > 0 ? "+" : ""
      }${row.accelScore.toFixed(1)}`,
    );
  }
  return lines;
}

function MetricValue({
  value,
  positive,
  negative,
}: {
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={clsx(
        "font-mono text-xs font-semibold",
        positive && "text-emerald-500",
        negative && "text-red-500",
      )}
    >
      {value}
    </div>
  );
}

function MetaBadge({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={clsx(
        "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        className,
      )}
    >
      {children}
    </span>
  );
}

function StatusFilterButton({
  label,
  count,
  variant,
  active,
  activeClassName,
  onClick,
}: {
  label: string;
  count: number;
  variant: Exclude<
    keyof typeof STATUS_BUTTON_STYLES,
    "default"
  >;
  active: boolean;
  activeClassName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
        STATUS_BUTTON_STYLES[
          active || count > 0 ? variant : "default"
        ],
        active
          ? activeClassName
          : "hover:-translate-y-px",
      )}
    >
      {count} {label}
    </button>
  );
}

function NewsMetadata({
  item,
  refMs,
}: {
  item: RossNewsItem;
  refMs: number;
}) {
  const tone = newsTone(item);
  const fresh = isFreshNews(item.publishedAt, refMs);
  const ago = timeAgo(item.publishedAt, refMs);

  if (
    !item.publisher &&
    !item.window &&
    !tone &&
    !fresh &&
    !ago
  ) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 text-[9px] leading-none">
      {item.window && (
        <MetaBadge className="bg-sky-500/15 text-sky-700 dark:text-sky-300">
          {WINDOW_LABEL[item.window]}
        </MetaBadge>
      )}
      {fresh && (
        <MetaBadge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
          Fresh
        </MetaBadge>
      )}
      {tone && (
        <MetaBadge className={tone.className}>
          {tone.label}
        </MetaBadge>
      )}
      {item.publisher && (
        <span className="subtle">{item.publisher}</span>
      )}
      {ago && <span className="subtle">{ago}</span>}
    </div>
  );
}

function NewsItemCard({
  item,
  refMs,
  ticker,
  onSelect,
  showSummary = false,
}: {
  item: RossNewsItem;
  refMs: number;
  ticker?: string;
  onSelect?: (ticker: string) => void;
  showSummary?: boolean;
}) {
  return (
    <div className="flex gap-2 items-start rounded border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 px-2 py-1.5">
      {ticker && onSelect && (
        <button
          type="button"
          onClick={() => onSelect(ticker)}
          className="shrink-0 font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          {ticker}
        </button>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <NewsMetadata item={item} refMs={refMs} />
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[11px] text-ink/85 hover:text-ink leading-snug"
        >
          {item.title}
        </a>
        {showSummary && item.summary && (
          <p className="text-[10px] subtle leading-snug line-clamp-3">
            {item.summary}
          </p>
        )}
      </div>
    </div>
  );
}

function PillarDots({ row }: { row: RossRow }) {
  return (
    <span className="flex gap-0.5">
      {row.pillars.map((pillar) => (
        <span
          key={pillar.key}
          title={`${pillar.label}: ${pillar.status} (${pillar.value})`}
          className={clsx(
            "inline-block w-2 h-2 rounded-full",
            pillar.status === "pass"
              ? "bg-emerald-500"
              : pillar.status === "fail"
                ? "bg-red-500"
                : "bg-amber-400",
          )}
        />
      ))}
    </span>
  );
}

function SelectableTableRow({
  children,
  row,
  selected,
  onSelect,
}: {
  children: ReactNode;
  row: RossRow;
  selected: boolean;
  onSelect: (ticker: string) => void;
}) {
  return (
    <tr
      tabIndex={0}
      role="button"
      aria-selected={selected}
      onClick={() => onSelect(row.ticker)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(row.ticker);
        }
      }}
      className={clsx(
        "border-t border-line cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500",
        selected
          ? "bg-emerald-500/15"
          : "hover:bg-surface-2/70",
      )}
    >
      {children}
    </tr>
  );
}

function HighOfDayPanel({
  result,
  filter,
  onFilterChange,
  onToggleFilter,
  selectedTicker,
  onSelect,
}: {
  result: RossResult;
  filter: HighOfDayFilter;
  onFilterChange: (filter: HighOfDayFilter) => void;
  onToggleFilter: (
    filter: Exclude<HighOfDayFilter, "all">,
  ) => void;
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
}) {
  const rows = useMemo(
    () => filteredHighOfDayRows(result.rows, filter),
    [result.rows, filter],
  );
  const risingLabel = risingExtendedLabel(
    result.marketSession,
    result.asOf,
  );
  const countVariant =
    filter === "green"
      ? "success"
      : filter === "watch"
        ? "warn"
        : filter === "rising"
          ? "info"
          : "default";
  const emptyMessage =
    filter === "green"
      ? "No fully qualified momentum names yet."
      : "No rows match the current High-of-Day filter.";

  return (
    <section className="card !rounded-lg !p-2.5">
      <header className="flex items-center gap-1.5 mb-1.5">
        <Flame className="w-3.5 h-3.5 text-orange-500" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide">
          High of Day Momentum
        </h2>
        <Badge
          variant={rows.length > 0 ? countVariant : "default"}
          className="ml-auto"
        >
          {rows.length}
        </Badge>
      </header>
      <div className="mb-2 flex flex-wrap gap-1">
        {HOD_FILTER_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={filter === option.key}
            onClick={() =>
              option.key === "all"
                ? onFilterChange("all")
                : onToggleFilter(option.key)
            }
            className={clsx(
              "rounded px-2 py-0.5 text-[10px] font-medium border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-orange-500",
              filter === option.key
                ? option.activeClass
                : "border-line bg-surface-2 text-ink/70 hover:border-orange-400",
            )}
          >
            {option.key === "rising" ? risingLabel : option.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] subtle">
          {emptyMessage}
        </p>
      ) : (
        <div className="max-h-[238px] overflow-auto rounded-md border border-line">
          <table className="min-w-[640px] w-full text-[10px] leading-tight">
            <thead className="sticky top-0 bg-surface-2/95 backdrop-blur text-ink/80">
              <tr>
                <th className="px-2 py-1.5 text-left">Ticker</th>
                <th className="px-2 py-1.5 text-left">Qual / Watch</th>
                <th className="px-2 py-1.5 text-right">Px</th>
                <th className="px-2 py-1.5 text-right">Vol</th>
                <th className="px-2 py-1.5 text-right">Float</th>
                <th className="px-2 py-1.5 text-right">RVol</th>
                <th className="px-2 py-1.5 text-right">Gap / Chg</th>
                <th className="px-2 py-1.5 text-right">Cue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const time = rowTimeMeta(row);
                const extCopy = extendedHoursDisplayCopy(
                  result.marketSession,
                  row.extendedSession,
                  result.asOf,
                );
                return (
                  <SelectableTableRow
                    key={row.ticker}
                    row={row}
                    selected={selectedTicker === row.ticker}
                    onSelect={onSelect}
                  >
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-semibold text-ink">
                          {row.ticker}
                        </span>
                        {row.strongMomentum && (
                          <Flame className="w-3 h-3 text-orange-500" />
                        )}
                        {row.news.length > 0 && (
                          <Newspaper className="w-3 h-3 text-sky-500" />
                        )}
                      </div>
                    </td>
                    <td
                      className="px-2 py-1.5 whitespace-nowrap"
                      title={time?.title}
                    >
                      {time ? (
                        <div className="flex items-center gap-1">
                          <span className="subtle uppercase">
                            {time.label}
                          </span>
                          <span className="font-mono">
                            {time.value}
                          </span>
                        </div>
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {fmtPrice(rowPrice(row))}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {fmtShares(row.candidate.volume)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {fmtShares(row.candidate.floatShares)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {fmtRvol(row.currentRvol)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <div
                        className={clsx(
                          "font-mono tabular-nums",
                          (rowChangePct(row) ?? 0) >= 0
                            ? "text-emerald-500"
                            : "text-red-500",
                        )}
                      >
                        {fmtPct(rowChangePct(row))}
                      </div>
                      {row.extendedChangePct != null && (
                        <div
                          title={extCopy.title}
                          className={clsx(
                            "font-mono tabular-nums",
                            row.extendedChangePct > 0
                              ? "text-emerald-500"
                              : "text-red-500",
                          )}
                        >
                          {extCopy.tag}{" "}
                          {fmtPct(row.extendedChangePct)}
                          {extCopy.cue && (
                            <span className="ml-1 text-[8px] subtle tracking-wide">
                              {extCopy.cue}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        {row.news.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-300">
                            <Newspaper className="w-3 h-3" />
                            <span className="font-mono">
                              {row.news.length}
                            </span>
                          </span>
                        )}
                        <PillarDots row={row} />
                      </div>
                    </td>
                  </SelectableTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ContinuationPanel({
  result,
  selectedTicker,
  onSelect,
}: {
  result: RossResult;
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
}) {
  const rows = useMemo(
    () => continuationRows(result.rows),
    [result.rows],
  );

  return (
    <section className="card !rounded-lg !p-2.5">
      <header className="flex items-center gap-1.5 mb-1.5">
        <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide">
          Continuation
        </h2>
        <Badge
          variant={rows.length > 0 ? "warn" : "default"}
          className="ml-auto"
        >
          {rows.length}
        </Badge>
      </header>
      {rows.length === 0 ? (
        <p className="text-[11px] subtle">
          No aligned or accelerating continuation setups.
        </p>
      ) : (
        <div className="max-h-[238px] overflow-auto rounded-md border border-line">
          <table className="min-w-[650px] w-full text-[10px] leading-tight">
            <thead className="sticky top-0 bg-surface-2/95 backdrop-blur text-ink/80">
              <tr>
                <th className="px-2 py-1.5 text-left">Ticker</th>
                <th className="px-2 py-1.5 text-right">Px</th>
                <th className="px-2 py-1.5 text-right">Vol</th>
                <th className="px-2 py-1.5 text-right">Float</th>
                <th className="px-2 py-1.5 text-right">RVol</th>
                <th className="px-2 py-1.5 text-right">Gap / Chg</th>
                <th className="px-2 py-1.5 text-center">Align</th>
                <th className="px-2 py-1.5 text-right">Accel / Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const accel = accelerationLines(row);
                const extCopy = extendedHoursDisplayCopy(
                  result.marketSession,
                  row.extendedSession,
                  result.asOf,
                );
                return (
                  <SelectableTableRow
                    key={row.ticker}
                    row={row}
                    selected={selectedTicker === row.ticker}
                    onSelect={onSelect}
                  >
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-semibold text-ink">
                          {row.ticker}
                        </span>
                        {row.extendedRising && (
                          <TrendingUp className="w-3 h-3 text-emerald-500" />
                        )}
                        {row.news.length > 0 && (
                          <Newspaper className="w-3 h-3 text-sky-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {fmtPrice(rowPrice(row))}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {fmtShares(row.candidate.volume)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {fmtShares(row.candidate.floatShares)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {fmtRvol(row.currentRvol)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <div
                        className={clsx(
                          "font-mono tabular-nums",
                          (rowChangePct(row) ?? 0) >= 0
                            ? "text-emerald-500"
                            : "text-red-500",
                        )}
                      >
                        {fmtPct(rowChangePct(row))}
                      </div>
                      {row.extendedChangePct != null && (
                        <div
                          title={extCopy.title}
                          className={clsx(
                            "font-mono tabular-nums",
                            row.extendedChangePct > 0
                              ? "text-emerald-500"
                              : "text-red-500",
                          )}
                        >
                          {extCopy.tag}{" "}
                          {fmtPct(row.extendedChangePct)}
                          {extCopy.cue && (
                            <span className="ml-1 text-[8px] subtle tracking-wide">
                              {extCopy.cue}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td
                      className="px-2 py-1.5 text-center whitespace-nowrap"
                      title={alignmentTitle(row)}
                    >
                      <span className="font-mono">
                        {alignmentSummary(row)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {accel.length === 0 ? (
                        <span className="subtle">—</span>
                      ) : (
                        <div className="space-y-0.5">
                          {accel.map((line) => (
                            <div
                              key={line}
                              className="font-mono tabular-nums"
                            >
                              {line}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </SelectableTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PillarsScannerPanel({
  result,
  filter,
  onFilterChange,
  selectedTicker,
  onSelect,
}: {
  result: RossResult;
  filter: DashboardFilter;
  onFilterChange: (filter: DashboardFilter) => void;
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
}) {
  const rows = useMemo(
    () => applyDashboardFilter(result.rows, filter),
    [result.rows, filter],
  );
  const risingLabel = risingExtendedLabel(
    result.marketSession,
    result.asOf,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndex = rows.findIndex(
    (row) => row.ticker === selectedTicker,
  );

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.key !== "ArrowUp" &&
        event.key !== "ArrowDown"
      ) {
        return;
      }
      event.preventDefault();
      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(
              rows.length - 1,
              selectedIndex < 0 ? 0 : selectedIndex + 1,
            )
          : Math.max(
              0,
              selectedIndex < 0
                ? rows.length - 1
                : selectedIndex - 1,
            );
      if (rows[nextIndex]) onSelect(rows[nextIndex].ticker);
    };
    element.addEventListener("keydown", handleKey);
    return () =>
      element.removeEventListener("keydown", handleKey);
  }, [onSelect, rows, selectedIndex]);

  return (
    <section className="card !rounded-lg !p-2.5 flex flex-col min-h-[300px] lg:min-h-[340px]">
      <header className="flex items-center gap-1.5 mb-2 flex-wrap">
        <BarChart2 className="w-3.5 h-3.5 text-sky-500" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide">
          Ross 5 Pillars Scanner
        </h2>
        <Badge variant="info" className="ml-auto">
          {rows.length} / {result.rows.length}
        </Badge>
      </header>
      <div className="flex flex-wrap gap-1 mb-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onFilterChange(option.key)}
            className={clsx(
              "px-2 py-0.5 rounded text-[10px] font-medium border transition-colors",
              filter === option.key
                ? "border-sky-500 bg-sky-500/20 text-sky-700 dark:text-sky-300"
                : "border-line bg-surface-2 text-ink/70 hover:border-sky-400",
            )}
          >
            {option.key === "rising" ? risingLabel : option.label}
          </button>
        ))}
      </div>
      <div
        ref={listRef}
        tabIndex={0}
        role="grid"
        aria-label="Ross screener results"
        className="flex-1 overflow-y-auto space-y-1 pr-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 rounded"
      >
        {rows.length === 0 ? (
          <p className="text-[11px] subtle pt-6 text-center">
            No rows match the current filter.
          </p>
        ) : (
          rows.map((row) => (
            <button
              key={row.ticker}
              type="button"
              onClick={() => onSelect(row.ticker)}
              className={clsx(
                "w-full text-left px-2 py-1.5 rounded-md border transition-colors",
                selectedTicker === row.ticker
                  ? "border-emerald-500 bg-emerald-500/15 ring-1 ring-emerald-500/40"
                  : row.allAutomatedMet
                    ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                    : "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10",
              )}
            >
              <div className="flex items-center gap-1">
                <span className="font-mono font-bold text-xs">
                  {row.ticker}
                </span>
                <span className="text-[10px] subtle truncate max-w-[120px]">
                  {row.name}
                </span>
                {row.news.length > 0 && (
                  <Newspaper className="w-3 h-3 text-sky-400" />
                )}
                <span
                  className={clsx(
                    "font-mono text-[11px] ml-auto font-semibold",
                    (rowChangePct(row) ?? 0) >= 0
                      ? "text-emerald-500"
                      : "text-red-500",
                  )}
                >
                  {fmtPct(rowChangePct(row))}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] subtle">
                  {fmtPrice(rowPrice(row))}
                </span>
                <span className="text-[10px] subtle">
                  RVol {fmtRvol(row.currentRvol)}
                </span>
                <span className="ml-auto">
                  <PillarDots row={row} />
                </span>
              </div>
            </button>
          ))
        )}
      </div>
      <p className="text-[9px] subtle mt-2 pt-1.5 border-t border-line">
        Focus this panel and use ↑↓ to navigate.
      </p>
    </section>
  );
}

function StockDetailPanel({
  result,
  ticker,
}: {
  result: RossResult;
  ticker: string | null;
}) {
  const refMs = referenceMs(result.asOf);
  const row = useMemo(
    () =>
      result.rows.find((item) => item.ticker === ticker) ??
      null,
    [result.rows, ticker],
  );

  if (!row) {
    return (
      <section className="card !rounded-lg !p-3">
        <p className="text-[11px] subtle text-center py-4">
          Select a ticker to view quote, pillars, and news.
        </p>
      </section>
    );
  }

  const fresh = freshStatus(row, refMs);
  const extCopy = extendedHoursDisplayCopy(
    result.marketSession,
    row.extendedSession,
    result.asOf,
  );

  const metrics: Array<{
    label: string;
    value: string;
    positive?: boolean;
    negative?: boolean;
    title?: string;
    cue?: string | null;
  }> = [
    { label: "Price", value: fmtPrice(rowPrice(row)) },
    {
      label: "Change",
      value: fmtPct(rowChangePct(row)),
      positive: (rowChangePct(row) ?? 0) > 0,
      negative: (rowChangePct(row) ?? 0) < 0,
    },
    {
      label: "RVol",
      value: fmtRvol(row.currentRvol),
    },
    { label: "Volume", value: fmtShares(row.candidate.volume) },
    { label: "Float", value: fmtShares(row.candidate.floatShares) },
    {
      label: "Mkt Cap",
      value: fmtMarketCap(row.candidate.marketCap),
    },
    {
      label: extCopy.label,
      value: row.extendedChangePct != null ? fmtPct(row.extendedChangePct) : "—",
      positive: (row.extendedChangePct ?? 0) > 0,
      negative: (row.extendedChangePct ?? 0) < 0,
      title: extCopy.title,
      cue: extCopy.cue,
    },
  ];

  return (
    <section className="card !rounded-lg !p-3 space-y-2">
      <header className="flex items-center gap-2 flex-wrap">
        <span className="font-mono font-bold text-base">
          {row.ticker}
        </span>
        <span className="text-xs subtle truncate max-w-[180px]">
          {row.name}
        </span>
        <Badge
          variant={row.allAutomatedMet ? "success" : "warn"}
          className="ml-auto"
        >
          {row.stage === "qualified" ? "Qualified" : "Watch"}
        </Badge>
        {fresh && (
          <MetaBadge
            className={
              fresh.stage === "watch"
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                : "bg-sky-500/20 text-sky-700 dark:text-sky-300"
            }
          >
            {fresh.label}
          </MetaBadge>
        )}
      </header>
      <p className="text-[10px] font-medium text-ink/80">
        {summarizePillars(row.pillars)}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            title={metric.title}
            className="rounded-md bg-surface-2 p-1.5"
          >
            <div className="text-[9px] subtle uppercase">
              {metric.label}
            </div>
            <MetricValue
              value={metric.value}
              positive={metric.positive}
              negative={metric.negative}
            />
            {metric.cue && (
              <div className="mt-0.5 text-[8px] subtle tracking-wide">
                {metric.cue}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-0.5">
        {row.pillars.map((pillar, index) => (
          <div
            key={pillar.key}
            title={`${pillar.label}: ${pillar.detail}`}
            className={clsx(
              "rounded p-1 text-center text-[9px] font-semibold border",
              pillar.status === "pass"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : pillar.status === "fail"
                  ? "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300"
                  : "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
            )}
          >
            <div className="truncate">
              {index + 1}. {pillar.label.split(" ")[0]}
            </div>
            <div className="font-mono truncate">
              {pillar.value}
            </div>
          </div>
        ))}
      </div>
      <div>
        <h3 className="text-[10px] uppercase tracking-wide subtle mb-1">
          Catalyst News
        </h3>
        {row.news.length === 0 ? (
          <p className="text-[11px] subtle">
            No auto-detected catalyst. Verify manually.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {row.news.map((item) => (
              <li key={item.link}>
                <NewsItemCard
                  item={item}
                  refMs={refMs}
                  showSummary
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-[10px]">
        <a
          href={row.chartUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="subtle hover:text-ink"
        >
          TradingView ↗
        </a>
        <a
          href={row.googleFinanceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="subtle hover:text-ink"
        >
          Google Finance ↗
        </a>
      </div>
    </section>
  );
}

function ChartPanel({ ticker }: { ticker: string | null }) {
  if (!ticker) {
    return (
      <section className="card !rounded-lg !p-3">
        <div className="flex flex-col items-center justify-center gap-2 py-8">
          <Activity className="w-4 h-4 text-emerald-500" />
          <p className="text-[11px] subtle text-center">
            Select a ticker to view its intraday chart.
          </p>
        </div>
      </section>
    );
  }
  return <IntradayChart ticker={ticker} interval="1m" range="1d" compact />;
}

function NewsRoomPanel({
  result,
  onSelect,
}: {
  result: RossResult;
  onSelect: (ticker: string) => void;
}) {
  const refMs = referenceMs(result.asOf);
  const news = useMemo(
    () => aggregateNews(result.rows),
    [result.rows],
  );

  return (
    <section className="card !rounded-lg !p-3">
      <header className="flex items-center gap-1.5 mb-2">
        <Newspaper className="w-3.5 h-3.5 text-sky-500" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide">
          News Room
        </h2>
        <Badge variant="info" className="ml-auto">
          {news.length}
        </Badge>
      </header>
      {news.length === 0 ? (
        <p className="text-[11px] subtle text-center py-4">
          No catalyst news since the previous market close.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-[320px] overflow-y-auto pr-0.5">
          {news.map((item) => (
            <li key={item.link}>
              <NewsItemCard
                item={item}
                refMs={refMs}
                ticker={item.ticker}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RossDashboardClient({
  initialResult,
  initialTicker,
}: {
  initialResult: RossResult;
  initialTicker: string | null;
}) {
  const [result, setResult] =
    useState<RossResult>(initialResult);
  const [selectedTicker, setSelectedTickerState] =
    useState<string | null>(initialTicker);
  const [filter, setFilter] =
    useState<DashboardFilter>("all");
  const [hodFilter, setHodFilter] =
    useState<HighOfDayFilter>("all");
  const [refreshIntervalSec, setRefreshIntervalSec] =
    useState<number>(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const inFlightRef = useRef(false);

  const selectTicker = useCallback((ticker: string) => {
    setSelectedTickerState(ticker);
    const params = new URLSearchParams(window.location.search);
    params.set("ticker", ticker);
    window.history.replaceState(
      window.history.state,
      "",
      `/ross-dashboard?${params.toString()}`,
    );
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/ross?extRising=1${force ? "&fresh=1" : ""}`,
        {
          cache: "no-store",
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const next = (await response.json()) as RossResult;
      if (aliveRef.current) {
        setResult(next);
      }
    } catch (pollError: unknown) {
      if (aliveRef.current) {
        setError(
          pollError instanceof Error
            ? pollError.message
            : "Refresh failed",
        );
      }
    } finally {
      inFlightRef.current = false;
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  const toggleHodFilter = useCallback(
    (next: Exclude<HighOfDayFilter, "all">) => {
      setHodFilter((current) =>
        current === next ? "all" : next,
      );
    },
    [],
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (refreshIntervalSec <= 0) return;
    const interval = window.setInterval(() => {
      void refresh();
    }, refreshIntervalSec * 1_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [refresh, refreshIntervalSec]);

  useEffect(() => {
    if (selectedTicker || result.rows.length === 0) return;
    selectTicker(result.rows[0].ticker);
  }, [result.rows, selectedTicker, selectTicker]);

  const refreshLabel =
    REFRESH_INTERVAL_OPTIONS.find(
      (option) => option.sec === refreshIntervalSec,
    )?.label ?? "1m";
  const risingLabel = risingExtendedLabel(
    result.marketSession,
    result.asOf,
  );
  const refreshStatusText =
    refreshIntervalSec > 0
      ? `auto-refresh ${refreshLabel}`
      : "auto-refresh off";

  return (
    <div className="space-y-2">
      <div className="flex items-center flex-wrap gap-2 text-[11px]">
        <StatusFilterButton
          label="green"
          count={result.greenCount}
          variant="success"
          active={hodFilter === "green"}
          activeClassName="outline outline-2 outline-offset-1 outline-emerald-500"
          onClick={() => toggleHodFilter("green")}
        />
        <StatusFilterButton
          label="watch"
          count={result.watchCount}
          variant="warn"
          active={hodFilter === "watch"}
          activeClassName="outline outline-2 outline-offset-1 outline-amber-500"
          onClick={() => toggleHodFilter("watch")}
        />
        <StatusFilterButton
          label={risingLabel}
          count={result.risingCount}
          variant="info"
          active={hodFilter === "rising"}
          activeClassName="outline outline-2 outline-offset-1 outline-sky-500"
          onClick={() => toggleHodFilter("rising")}
        />
        <Badge
          variant={
            result.withNewsCount > 0 ? "info" : "default"
          }
        >
          {result.withNewsCount} w/ news
        </Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[10px] subtle">
            Refresh:
          </span>
          <select
            value={refreshIntervalSec}
            onChange={(event) =>
              setRefreshIntervalSec(Number(event.target.value))
            }
            aria-label="Ross dashboard auto-refresh interval"
            title="Ross dashboard auto-refresh interval"
            className="text-[10px] bg-surface-2 border border-line rounded-md px-2 py-1"
          >
            {REFRESH_INTERVAL_OPTIONS.map((option) => (
              <option key={option.sec} value={option.sec}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void refresh(true)}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-[10px] font-medium hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60"
            title="Force a live Ross scan now"
          >
            <RefreshCw
              className={clsx(
                "w-3 h-3",
                loading && "animate-spin",
              )}
            />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {error && (
          <span className="text-red-500">⚠ {error}</span>
        )}
        <span className="subtle text-[10px]">
          {new Date(result.asOf).toLocaleTimeString("en-US", {
            timeZone: "America/New_York",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          ET · {result.marketSession} · {result.universeSource}
          {" "}· {refreshStatusText}
        </span>
      </div>
      {result.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300">
          {result.warnings.join(" ")}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,340px)]">
        <div className="order-1 space-y-2 lg:col-span-2 xl:order-2 xl:col-span-1">
          <ChartPanel ticker={selectedTicker} />
          <PillarsScannerPanel
            result={result}
            filter={filter}
            onFilterChange={setFilter}
            selectedTicker={selectedTicker}
            onSelect={selectTicker}
          />
        </div>
        <div className="order-2 space-y-2 xl:order-1">
          <HighOfDayPanel
            result={result}
            filter={hodFilter}
            onFilterChange={setHodFilter}
            onToggleFilter={toggleHodFilter}
            selectedTicker={selectedTicker}
            onSelect={selectTicker}
          />
          <ContinuationPanel
            result={result}
            selectedTicker={selectedTicker}
            onSelect={selectTicker}
          />
        </div>
        <div className="order-3 space-y-2 xl:order-3">
          <StockDetailPanel
            result={result}
            ticker={selectedTicker}
          />
          <NewsRoomPanel
            result={result}
            onSelect={selectTicker}
          />
        </div>
      </div>
      <footer className="text-[10px] subtle border-t border-line pt-2 leading-relaxed">
        <strong className="text-ink/80">
          Educational use only — not investment advice.
        </strong>{" "}
        Live mover and catalyst data may be delayed or incomplete.
        Verify the catalyst, liquidity, and your risk plan before
        trading.
      </footer>
    </div>
  );
}
