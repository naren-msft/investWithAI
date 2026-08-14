import type { PillarResult, RossNewsItem, RossRow } from "./types";

export type HighOfDayFilter =
  | "all"
  | "green"
  | "watch"
  | "rising";

export type DashboardFilter =
  | "all"
  | "green"
  | "watch"
  | "strong"
  | "rising"
  | "news";

function highOfDayScore(row: RossRow): number {
  return row.peakChangePct ?? row.currentChangePct ?? row.candidate.changePct ?? -Infinity;
}

export function filteredHighOfDayRows(
  rows: RossRow[],
  filter: HighOfDayFilter,
  limit = 12,
): RossRow[] {
  return rows
    .filter((row) => {
      switch (filter) {
        case "green":
          return row.allAutomatedMet;
        case "watch":
          return row.stage === "watch";
        case "rising":
          return row.extendedRising;
        default:
          return true;
      }
    })
    .sort((a, b) => highOfDayScore(b) - highOfDayScore(a))
    .slice(0, limit);
}

export function highOfDayRows(rows: RossRow[], limit = 12): RossRow[] {
  return filteredHighOfDayRows(rows, "green", limit);
}

export function continuationRows(rows: RossRow[], limit = 12): RossRow[] {
  return rows
    .filter(
      (row) =>
        row.extendedRising ||
        (row.signalAlignment?.alignedCount ?? 0) >= 3 ||
        (row.stage === "watch" && (row.accelScore ?? 0) > 0),
    )
    .sort((a, b) => {
      const alignmentDiff =
        (b.signalAlignment?.alignedCount ?? 0) -
        (a.signalAlignment?.alignedCount ?? 0);
      if (alignmentDiff !== 0) return alignmentDiff;
      return (
        (b.accelScore ?? b.extendedChangePct ?? -Infinity) -
        (a.accelScore ?? a.extendedChangePct ?? -Infinity)
      );
    })
    .slice(0, limit);
}

export function applyDashboardFilter(
  rows: RossRow[],
  filter: DashboardFilter,
): RossRow[] {
  switch (filter) {
    case "green":
      return rows.filter((row) => row.allAutomatedMet);
    case "watch":
      return rows.filter((row) => row.stage === "watch");
    case "strong":
      return rows.filter((row) => row.strongMomentum);
    case "rising":
      return rows.filter((row) => row.extendedRising);
    case "news":
      return rows.filter((row) => row.news.length > 0);
    default:
      return rows;
  }
}

export interface AggregateNewsItem extends RossNewsItem {
  ticker: string;
}

type RowStatusTimestamps = Pick<
  RossRow,
  "stage" | "firstSeenAt" | "firstWatchAt" | "firstQualifiedAt"
>;

export function firstWatchSeenAt(
  row: Pick<RossRow, "firstSeenAt" | "firstWatchAt">,
): string | null {
  return row.firstWatchAt ?? row.firstSeenAt ?? null;
}

export function firstQualifiedSeenAt(
  row: Pick<RossRow, "firstSeenAt" | "firstQualifiedAt">,
): string | null {
  return row.firstQualifiedAt ?? row.firstSeenAt ?? null;
}

function pillarSummaryLabel(pillar: PillarResult): string {
  switch (pillar.key) {
    case "rvol":
      return "RVol";
    case "change":
      return "Daily % Change";
    case "catalyst":
      return "Catalyst";
    case "price":
      return "Price Range";
    case "float":
      return pillar.label === "Large Cap" ? "Large Cap" : "Float";
    default:
      return pillar.label;
  }
}

export function summarizePillars(pillars: PillarResult[]): string {
  if (pillars.length === 0) return "—";

  const passedCount = pillars.filter((pillar) => pillar.status === "pass").length;
  if (passedCount === pillars.length) return "All pillars matched";

  const failed = pillars
    .filter((pillar) => pillar.status === "fail")
    .map(pillarSummaryLabel);
  const verify = pillars
    .filter((pillar) => pillar.status === "na")
    .map(pillarSummaryLabel);

  return [
    `${passedCount}/${pillars.length} passed`,
    failed.length > 0 ? `Failed: ${failed.join(", ")}` : null,
    verify.length > 0 ? `Verify: ${verify.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface FreshStatus {
  stage: "watch" | "qualified";
  label: "New Watch" | "New Qualified";
  freshAt: string;
  firstWatchAt: string | null;
  firstQualifiedAt: string | null;
}

export function freshStatus(
  row: RowStatusTimestamps,
  referenceMs: number,
  freshMs = 20 * 60 * 1000,
): FreshStatus | null {
  const firstWatchAt = firstWatchSeenAt(row);
  const firstQualifiedAt = firstQualifiedSeenAt(row);
  const freshAt =
    row.stage === "watch" ? firstWatchAt : firstQualifiedAt;
  if (!freshAt) return null;

  const freshAtMs = Date.parse(freshAt);
  if (!Number.isFinite(freshAtMs)) return null;
  if (Math.max(0, referenceMs - freshAtMs) > freshMs) return null;

  return {
    stage: row.stage,
    label: row.stage === "watch" ? "New Watch" : "New Qualified",
    freshAt,
    firstWatchAt,
    firstQualifiedAt: row.firstQualifiedAt ?? null,
  };
}

export function aggregateNews(rows: RossRow[]): AggregateNewsItem[] {
  const seen = new Set<string>();
  const items: AggregateNewsItem[] = [];
  for (const row of rows) {
    for (const item of row.news) {
      if (seen.has(item.link)) continue;
      seen.add(item.link);
      items.push({ ...item, ticker: row.ticker });
    }
  }
  return items.sort(
    (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0),
  );
}
