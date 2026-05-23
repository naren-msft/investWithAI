import { lookupHoliday, type MarketHolidayType } from "@/config/marketCalendar";

/**
 * Pure helpers for determining the current US equity market state
 * (NYSE schedule) without any external dependencies. All time math
 * is performed in America/New_York and is therefore DST-safe.
 */

export type MarketState =
  | "open"
  | "closed-weekend"
  | "closed-holiday"
  | "closed-premarket"
  | "closed-afterhours"
  | "early-close"; // still open, but closing early today

export interface MarketStatus {
  state: MarketState;
  /** Short human label, e.g. "Memorial Day", "Weekend", "After hours". */
  reason: string;
  /** Next regular open (9:30am ET on the next trading day). */
  nextOpen: Date;
  /** Today's close (4:00pm ET, or 1:00pm ET on early-close days). null when fully closed. */
  nextClose: Date | null;
  /** True if today is an early-close trading day, regardless of state. */
  isEarlyCloseDay: boolean;
}

const TZ = "America/New_York";

interface EtParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function etPartsOf(at: Date): EtParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  // Intl may return "24" for midnight under hour12:false in some engines.
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday as string] ?? 0,
  };
}

function nyOffsetMinutes(at: Date): number {
  const p = etPartsOf(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - at.getTime()) / 60000;
}

/**
 * Construct a Date representing the given wall-clock time in America/New_York.
 * Handles DST transitions by iterating once on the offset.
 */
function makeNyDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(naive);
  const offset1 = nyOffsetMinutes(guess);
  guess = new Date(naive - offset1 * 60000);
  const offset2 = nyOffsetMinutes(guess);
  if (offset2 !== offset1) {
    guess = new Date(naive - offset2 * 60000);
  }
  return guess;
}

function isoDate(p: { year: number; month: number; day: number }): string {
  const m = String(p.month).padStart(2, "0");
  const d = String(p.day).padStart(2, "0");
  return `${p.year}-${m}-${d}`;
}

function addDaysEt(p: EtParts, days: number): EtParts {
  // Use UTC math on the date portion (no time-of-day) to step days safely.
  const ms = Date.UTC(p.year, p.month - 1, p.day) + days * 86_400_000;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
    weekday: d.getUTCDay(),
  };
}

interface SessionBoundaries {
  open: Date;
  close: Date;
  type: MarketHolidayType | "regular";
  holidayName?: string;
}

/**
 * Returns the regular trading session bounds for the given ET date,
 * or null if that date is a weekend or full-closure holiday.
 */
function sessionFor(p: EtParts): SessionBoundaries | null {
  if (p.weekday === 0 || p.weekday === 6) return null;
  const iso = isoDate(p);
  const holiday = lookupHoliday(iso);
  if (holiday?.type === "closed") return null;

  const open = makeNyDate(p.year, p.month, p.day, 9, 30);
  const closeHour = holiday?.type === "early-close" ? 13 : 16;
  const close = makeNyDate(p.year, p.month, p.day, closeHour, 0);
  return {
    open,
    close,
    type: holiday?.type ?? "regular",
    holidayName: holiday?.name,
  };
}

function nextTradingSession(from: EtParts): SessionBoundaries {
  // Search up to ~20 days ahead — more than enough to clear any holiday cluster.
  let cursor = from;
  for (let i = 0; i < 20; i++) {
    const s = sessionFor(cursor);
    if (s) return s;
    cursor = addDaysEt(cursor, 1);
  }
  // Fallback (shouldn't happen): next weekday at 9:30am.
  return {
    open: makeNyDate(cursor.year, cursor.month, cursor.day, 9, 30),
    close: makeNyDate(cursor.year, cursor.month, cursor.day, 16, 0),
    type: "regular",
  };
}

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const p = etPartsOf(now);
  const todayIso = isoDate(p);
  const todayHoliday = lookupHoliday(todayIso);
  const isWeekend = p.weekday === 0 || p.weekday === 6;
  const todaysSession = sessionFor(p);

  // Helper: next-open lookup starting from tomorrow (or later).
  const nextOpenFrom = (start: EtParts): Date => nextTradingSession(start).open;

  // ---- Fully closed cases ----
  if (isWeekend) {
    // Sat → Mon, Sun → Mon (or next trading day).
    const start = addDaysEt(p, p.weekday === 6 ? 2 : 1);
    return {
      state: "closed-weekend",
      reason: "Weekend",
      nextOpen: nextOpenFrom(start),
      nextClose: null,
      isEarlyCloseDay: false,
    };
  }

  if (todayHoliday?.type === "closed") {
    return {
      state: "closed-holiday",
      reason: todayHoliday.name,
      nextOpen: nextOpenFrom(addDaysEt(p, 1)),
      nextClose: null,
      isEarlyCloseDay: false,
    };
  }

  // ---- Weekday with a session today ----
  // todaysSession is guaranteed non-null here.
  const session = todaysSession!;
  const isEarlyCloseDay = session.type === "early-close";

  if (now < session.open) {
    return {
      state: "closed-premarket",
      reason: "Pre-market",
      nextOpen: session.open,
      nextClose: null,
      isEarlyCloseDay,
    };
  }

  if (now >= session.close) {
    return {
      state: "closed-afterhours",
      reason: isEarlyCloseDay ? "After early close" : "After hours",
      nextOpen: nextOpenFrom(addDaysEt(p, 1)),
      nextClose: null,
      isEarlyCloseDay,
    };
  }

  // Market is currently open.
  return {
    state: isEarlyCloseDay ? "early-close" : "open",
    reason: isEarlyCloseDay ? `Early close at 1:00pm ET — ${session.holidayName ?? ""}`.trim().replace(/—\s*$/, "").trim() : "Open",
    nextOpen: session.open,
    nextClose: session.close,
    isEarlyCloseDay,
  };
}

/** Format an absolute Date as wall-clock time in America/New_York. */
export function formatEt(at: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...opts,
  }).format(at);
}

/** Format a duration in ms as `Dd HH:MM:SS` (or `HH:MM:SS` when < 1 day). */
export function formatCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}
