import { promises as fs } from "node:fs";
import path from "node:path";
import { etDateOnly } from "@/lib/marketTime";
import type { RossRow } from "./types";

// =============================================================================
// Screener history — a lightweight, per-trading-day record of which tickers the
// screener surfaced and WHEN each was first/last seen. The live screener is
// otherwise stateless (a 45s in-memory cache), so without this there is no way
// to answer "when did DFNS first appear today?". Persisted to data/ (gitignored),
// same store philosophy as executions/snapshots. Best-effort — never throws.
// =============================================================================

export type ScreenerBook = "ross" | "largecap";

export interface TickerHistory {
  ticker: string;
  /** ISO of the first scan this ticker qualified on, for the trading day. */
  firstSeenAt: string;
  /** ISO of the most recent scan it qualified on. */
  lastSeenAt: string;
  /** Number of scans it has appeared in today. */
  seenCount: number;
  /** Best regular-session daily % change observed today. */
  peakChangePct: number | null;
  /** Best extended-hours (AH/PM) % change observed today. */
  peakExtendedPct: number | null;
  /** Whether it met all automated pillars (green) on any scan today. */
  everGreen: boolean;
}

/** Shape on disk: { days: { "YYYY-MM-DD": { ross: {TICKER: rec}, largecap: {…} } } }. */
interface HistoryFile {
  days: Record<string, Partial<Record<ScreenerBook, Record<string, TickerHistory>>>>;
}

const FILE = path.join(process.cwd(), "data", "screener-history.json");
/** Trading days to retain (bounds file growth). */
const MAX_DAYS = 10;

// In-process mutex — the screener re-scans concurrently (page SSR + client
// auto-refresh), so serialize read-modify-write to avoid lost updates.
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.catch(() => {}).then(fn);
  lock = run.catch(() => {});
  return run;
}

async function readFile(): Promise<HistoryFile> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const j = JSON.parse(raw) as HistoryFile;
    return j && typeof j === "object" && j.days ? j : { days: {} };
  } catch {
    return { days: {} };
  }
}

async function writeFile(data: HistoryFile): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

function maxOrNull(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/**
 * Record a screener scan's rows into today's history and return the resulting
 * per-ticker map for the day so callers can annotate rows with `firstSeenAt`.
 * `asOf` is the scan timestamp (ISO). Best-effort; on any error returns whatever
 * map it can (possibly empty) without throwing.
 */
export async function recordScreenerRows(
  book: ScreenerBook,
  rows: RossRow[],
  asOf: string,
): Promise<Record<string, TickerHistory>> {
  const day = etDateOnly(new Date(asOf));
  return withLock(async () => {
    const data = await readFile();
    const dayEntry = (data.days[day] ??= {});
    const bookMap: Record<string, TickerHistory> = (dayEntry[book] ??= {});

    for (const r of rows) {
      const prev = bookMap[r.ticker];
      const chg = r.candidate.changePct ?? null;
      const ext = r.extendedChangePct ?? null;
      if (prev) {
        prev.lastSeenAt = asOf;
        prev.seenCount += 1;
        prev.peakChangePct = maxOrNull(prev.peakChangePct, chg);
        prev.peakExtendedPct = maxOrNull(prev.peakExtendedPct, ext);
        prev.everGreen = prev.everGreen || r.allAutomatedMet;
      } else {
        bookMap[r.ticker] = {
          ticker: r.ticker,
          firstSeenAt: asOf,
          lastSeenAt: asOf,
          seenCount: 1,
          peakChangePct: chg,
          peakExtendedPct: ext,
          everGreen: r.allAutomatedMet,
        };
      }
    }

    // Prune old days.
    const days = Object.keys(data.days).sort();
    if (days.length > MAX_DAYS) {
      for (const d of days.slice(0, days.length - MAX_DAYS)) delete data.days[d];
    }

    try {
      await writeFile(data);
    } catch {
      // Best-effort persistence — still return the in-memory map for annotation.
    }
    return bookMap;
  });
}

/** Read the recorded history for a book on a given ET day (default: today). */
export async function readScreenerHistory(
  book: ScreenerBook,
  day: string = etDateOnly(),
): Promise<TickerHistory[]> {
  const data = await readFile();
  const map = data.days[day]?.[book] ?? {};
  return Object.values(map).sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt));
}

/** Look up a single ticker's history for a book on a given ET day. */
export async function getTickerHistory(
  book: ScreenerBook,
  ticker: string,
  day: string = etDateOnly(),
): Promise<TickerHistory | null> {
  const data = await readFile();
  return data.days[day]?.[book]?.[ticker.toUpperCase()] ?? null;
}
