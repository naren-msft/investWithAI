import { promises as fs } from "node:fs";
import path from "node:path";
import { etDateOnly } from "@/lib/marketTime";
import type {
  RossAlignmentSignalKey,
  RossAlignmentSignalState,
  RossRow,
} from "./types";

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
  /** ISO of the first scan this ticker surfaced on, for the trading day. */
  firstSeenAt: string;
  /** ISO of the most recent scan it surfaced on. */
  lastSeenAt: string;
  /** Number of scans it has appeared in today. */
  seenCount: number;
  /** Best active-session change-vs-close observed today. */
  peakChangePct: number | null;
  /** Best extended-hours (AH/PM) % change observed today. */
  peakExtendedPct: number | null;
  /** Most recent active-session change-vs-close observed (for acceleration). */
  lastChangePct?: number | null;
  /** Most recent EFFECTIVE relative volume observed (session-aware basis). */
  lastRvol?: number | null;
  /** The reading BEFORE `last*` (≥ a min gap older), for computing deltas. */
  prevChangePct?: number | null;
  /** The reading BEFORE `lastRvol` (same effective/session-aware basis). */
  prevRvol?: number | null;
  /** ISO of the `last*` reading — used to enforce the min gap before shifting. */
  lastObservedAt?: string | null;
  /** ISO belonging to the `prev*` acceleration reading. */
  prevObservedAt?: string | null;
  /** ISO the ticker first appeared as an early "watch" mover today. */
  firstWatchAt?: string | null;
  /** ISO the ticker first met ALL automated pillars (qualified/green) today. */
  firstQualifiedAt?: string | null;
  /** Number of scans on which the ticker was fully qualified. */
  qualifiedSeenCount?: number;
  /** Best daily change observed while fully qualified. */
  peakQualifiedChangePct?: number | null;
  /** Qualified signal snapshots used for forward validation. */
  alignmentSnapshots?: AlignmentSnapshot[];
  /** Whether it met all automated pillars (green) on any scan today. */
  everGreen: boolean;
}

export interface AlignmentOutcome {
  status: "captured" | "unavailable";
  capturedAt: string;
  targetAt: string;
  price30m: number | null;
  high30m: number | null;
  low30m: number | null;
  returnPct: number | null;
  maxGainPct: number | null;
  maxDrawdownPct: number | null;
}

export interface AlignmentSnapshot {
  id: string;
  scannedAt: string;
  scanPrice: number;
  session: "pre-market" | "regular" | "after-hours" | "closed" | "weekend";
  alignedCount: number;
  knownCount: number;
  confidence: "normal" | "low";
  signals: Record<RossAlignmentSignalKey, RossAlignmentSignalState>;
  outcome?: AlignmentOutcome;
}

export interface PendingAlignmentSnapshot {
  book: ScreenerBook;
  day: string;
  ticker: string;
  snapshot: AlignmentSnapshot;
}

/** Shape on disk: { days: { "YYYY-MM-DD": { ross: {TICKER: rec}, largecap: {…} } } }. */
interface HistoryFile {
  days: Record<string, Partial<Record<ScreenerBook, Record<string, TickerHistory>>>>;
}

const FILE = path.join(process.cwd(), "data", "screener-history.json");
/** Trading days to retain (bounds file growth). */
const MAX_DAYS = 10;

/** Minimum spacing between the `last` and `prev` acceleration readings. Prevents
 *  two rapid re-scans (e.g. a manual Refresh right after the auto poll) from
 *  collapsing the delta window to ~0s and producing meaningless deltas. */
export const ALIGNMENT_HISTORY_MIN_MS = 2 * 60 * 1000;
const MIN_ACCEL_GAP_MS = ALIGNMENT_HISTORY_MIN_MS;
const MAX_ALIGNMENT_SNAPSHOTS_PER_TICKER = 100;

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

export function applyTickerUpdate(
  prev: TickerHistory | undefined,
  r: Pick<
    RossRow,
    | "ticker"
    | "candidate"
    | "currentChangePct"
    | "currentRvol"
    | "stage"
    | "allAutomatedMet"
    | "extendedChangePct"
  >,
  asOf: string,
): TickerHistory {
  const chg = r.currentChangePct ?? null;
  const ext = r.extendedChangePct ?? null;
  const rvol = r.currentRvol ?? r.candidate.relativeVolume ?? null;
  const isQualified = r.stage === "qualified";
  const isWatch = r.stage === "watch";

  if (prev) {
    const entry: TickerHistory = { ...prev };
    const lastAt = entry.lastObservedAt ? Date.parse(entry.lastObservedAt) : 0;
    if (lastAt && Date.parse(asOf) - lastAt >= MIN_ACCEL_GAP_MS) {
      entry.prevRvol = entry.lastRvol ?? null;
      entry.prevChangePct = entry.lastChangePct ?? null;
      entry.prevObservedAt = entry.lastObservedAt ?? null;
    }
    entry.lastSeenAt = asOf;
    entry.lastObservedAt = asOf;
    entry.seenCount += 1;
    entry.peakChangePct = maxOrNull(entry.peakChangePct, chg);
    entry.peakExtendedPct = maxOrNull(entry.peakExtendedPct, ext);
    entry.lastChangePct = chg;
    entry.lastRvol = rvol;
    entry.everGreen = entry.everGreen || r.allAutomatedMet;
    if (isWatch && !entry.firstWatchAt) entry.firstWatchAt = asOf;
    if (isQualified) {
      if (!entry.firstQualifiedAt) entry.firstQualifiedAt = asOf;
      entry.qualifiedSeenCount = (entry.qualifiedSeenCount ?? 0) + 1;
      entry.peakQualifiedChangePct = maxOrNull(entry.peakQualifiedChangePct ?? null, chg);
    } else {
      entry.qualifiedSeenCount = 0;
      entry.peakQualifiedChangePct = null;
    }
    return entry;
  }

  return {
    ticker: r.ticker,
    firstSeenAt: asOf,
    lastSeenAt: asOf,
    seenCount: 1,
    peakChangePct: chg,
    peakExtendedPct: ext,
    lastChangePct: chg,
    lastRvol: rvol,
    prevChangePct: null,
    prevRvol: null,
    lastObservedAt: asOf,
    prevObservedAt: null,
    firstWatchAt: isWatch ? asOf : null,
    firstQualifiedAt: isQualified ? asOf : null,
    qualifiedSeenCount: isQualified ? 1 : 0,
    peakQualifiedChangePct: isQualified ? chg : null,
    alignmentSnapshots: [],
    everGreen: r.allAutomatedMet,
  };
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
      bookMap[r.ticker] = applyTickerUpdate(bookMap[r.ticker], r, asOf);
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

function signalRecord(row: RossRow): Record<RossAlignmentSignalKey, RossAlignmentSignalState> {
  const alignment = row.signalAlignment;
  const entries = alignment?.signals.map((signal) => [signal.key, signal.state]) ?? [];
  return Object.fromEntries(entries) as Record<RossAlignmentSignalKey, RossAlignmentSignalState>;
}

function sameSignalState(a: AlignmentSnapshot, row: RossRow): boolean {
  const alignment = row.signalAlignment;
  if (!alignment || a.alignedCount !== alignment.alignedCount || a.knownCount !== alignment.knownCount) {
    return false;
  }
  const next = signalRecord(row);
  return Object.keys(next).every(
    (key) => a.signals[key as RossAlignmentSignalKey] === next[key as RossAlignmentSignalKey],
  );
}

/** Persist qualified alignment snapshots, throttled unless the signal state changes. */
export async function recordAlignmentSnapshots(
  book: ScreenerBook,
  rows: RossRow[],
  asOf: string,
  session: AlignmentSnapshot["session"],
): Promise<void> {
  const day = etDateOnly(new Date(asOf));
  await withLock(async () => {
    const data = await readFile();
    const dayEntry = (data.days[day] ??= {});
    const bookMap: Record<string, TickerHistory> = (dayEntry[book] ??= {});

    for (const row of rows) {
      const alignment = row.signalAlignment;
      const scanPrice = row.currentPrice ?? row.candidate.price;
      if (!alignment || scanPrice == null || scanPrice <= 0) continue;
      const history = bookMap[row.ticker];
      if (!history) continue;
      const snapshots = (history.alignmentSnapshots ??= []);
      const last = snapshots[snapshots.length - 1];
      if (last && sameSignalState(last, row)) continue;

      snapshots.push({
        id: `${row.ticker}:${asOf}`,
        scannedAt: asOf,
        scanPrice,
        session,
        alignedCount: alignment.alignedCount,
        knownCount: alignment.knownCount,
        confidence: alignment.confidence,
        signals: signalRecord(row),
      });
      if (snapshots.length > MAX_ALIGNMENT_SNAPSHOTS_PER_TICKER) {
        snapshots.splice(0, snapshots.length - MAX_ALIGNMENT_SNAPSHOTS_PER_TICKER);
      }
    }
    try {
      await writeFile(data);
    } catch {
      // Best-effort persistence.
    }
  });
}

/** Return snapshots whose 30-minute target has elapsed and still need an outcome. */
export async function pendingAlignmentSnapshots(
  book: ScreenerBook,
  asOf: string,
): Promise<PendingAlignmentSnapshot[]> {
  const data = await readFile();
  const nowMs = Date.parse(asOf);
  const pending: PendingAlignmentSnapshot[] = [];
  for (const [day, dayEntry] of Object.entries(data.days)) {
    const map = dayEntry[book] ?? {};
    for (const [ticker, history] of Object.entries(map)) {
      for (const snapshot of history.alignmentSnapshots ?? []) {
        if (!snapshot.outcome && nowMs >= Date.parse(snapshot.scannedAt) + 30 * 60 * 1000) {
          pending.push({ book, day, ticker, snapshot });
        }
      }
    }
  }
  return pending.slice(0, 40);
}

/** Atomically attach captured outcomes to their persisted snapshots. */
export async function completeAlignmentOutcomes(
  outcomes: Array<{
    book: ScreenerBook;
    day: string;
    ticker: string;
    snapshotId: string;
    outcome: AlignmentOutcome;
  }>,
): Promise<void> {
  if (outcomes.length === 0) return;
  await withLock(async () => {
    const data = await readFile();
    for (const item of outcomes) {
      const history = data.days[item.day]?.[item.book]?.[item.ticker];
      const snapshot = history?.alignmentSnapshots?.find((entry) => entry.id === item.snapshotId);
      if (snapshot && !snapshot.outcome) snapshot.outcome = item.outcome;
    }
    try {
      await writeFile(data);
    } catch {
      // Best-effort persistence.
    }
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
