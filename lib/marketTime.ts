// Market-time helpers — US equities in ET (handles DST). All FOMC playbook
// gates and labels go through these so we don't accidentally compare UTC
// midnight against a 2pm-ET announcement window.

const TZ = "America/New_York";
const REGULAR_OPEN_MINUTES = 9 * 60 + 30;
const REGULAR_CLOSE_MINUTES = 16 * 60;
const EARLY_CLOSE_MINUTES = 13 * 60;

interface EtParts {
  year: number;
  month: number;
  day: number;
  dow: number;
  hour: number;
  minute: number;
}

function etParts(t: Date): EtParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(t);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    dow,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function utcDateParts(year: number, month: number, day: number, offsetDays: number = 0) {
  const d = new Date(Date.UTC(year, month - 1, day + offsetDays, 12));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), dow: d.getUTCDay() };
}

function nthWeekday(year: number, month: number, dow: number, nth: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((dow - firstDow + 7) % 7) + (nth - 1) * 7;
}

function lastWeekday(year: number, month: number, dow: number): number {
  const last = new Date(Date.UTC(year, month, 0));
  return last.getUTCDate() - ((last.getUTCDay() - dow + 7) % 7);
}

function observedFixedDate(year: number, month: number, day: number) {
  const actual = utcDateParts(year, month, day);
  if (actual.dow === 6) return utcDateParts(year, month, day, -1);
  if (actual.dow === 0) return utcDateParts(year, month, day, 1);
  return actual;
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function marketHolidayKeys(year: number): Set<string> {
  const keys = new Set<string>();
  const add = (d: { year: number; month: number; day: number }) =>
    keys.add(dateKey(d.year, d.month, d.day));

  add(observedFixedDate(year, 1, 1));
  add({ year, month: 1, day: nthWeekday(year, 1, 1, 3) }); // MLK Day
  add({ year, month: 2, day: nthWeekday(year, 2, 1, 3) }); // Presidents Day
  const easter = easterSunday(year);
  add(utcDateParts(easter.year, easter.month, easter.day, -2)); // Good Friday
  add({ year, month: 5, day: lastWeekday(year, 5, 1) }); // Memorial Day
  add(observedFixedDate(year, 6, 19));
  add(observedFixedDate(year, 7, 4));
  add({ year, month: 9, day: nthWeekday(year, 9, 1, 1) }); // Labor Day
  add({ year, month: 11, day: nthWeekday(year, 11, 4, 4) }); // Thanksgiving
  add(observedFixedDate(year, 12, 25));
  return keys;
}

function isMarketHolidayDate(year: number, month: number, day: number): boolean {
  const key = dateKey(year, month, day);
  return [year - 1, year, year + 1].some((holidayYear) => marketHolidayKeys(holidayYear).has(key));
}

function isTradingDate(year: number, month: number, day: number): boolean {
  const { dow } = utcDateParts(year, month, day);
  return dow !== 0 && dow !== 6 && !isMarketHolidayDate(year, month, day);
}

function isEarlyCloseDate(year: number, month: number, day: number): boolean {
  if (!isTradingDate(year, month, day)) return false;
  const key = dateKey(year, month, day);

  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const afterThanksgiving = utcDateParts(year, 11, thanksgiving, 1);
  if (key === dateKey(afterThanksgiving.year, afterThanksgiving.month, afterThanksgiving.day)) return true;

  return key === dateKey(year, 7, 3) || key === dateKey(year, 12, 24);
}

function marketCloseMinutes(year: number, month: number, day: number): number | null {
  if (!isTradingDate(year, month, day)) return null;
  return isEarlyCloseDate(year, month, day) ? EARLY_CLOSE_MINUTES : REGULAR_CLOSE_MINUTES;
}

export function nowEt(): Date { return new Date(); }

/** Convert any date to its YYYY-MM-DD in ET. */
export function etDateOnly(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** True if `t` falls on a US weekend (Sat or Sun in ET). */
export function isWeekendEt(t: Date = new Date()): boolean {
  const dow = etParts(t).dow;
  return dow === 0 || dow === 6;
}

/** True when `t` falls on a full-day exchange holiday in ET. */
export function isMarketHolidayEt(t: Date = new Date()): boolean {
  const et = etParts(t);
  return isMarketHolidayDate(et.year, et.month, et.day);
}

/** True if `t` is during the day's regular exchange session in ET. */
export function isRegularSessionEt(t: Date = new Date()): boolean {
  const et = etParts(t);
  const close = marketCloseMinutes(et.year, et.month, et.day);
  if (close == null) return false;
  const minutes = et.hour * 60 + et.minute;
  return minutes >= REGULAR_OPEN_MINUTES && minutes < close;
}

/** Pre-market window (04:00–09:30 ET). */
export function isPreMarketEt(t: Date = new Date()): boolean {
  const et = etParts(t);
  if (!isTradingDate(et.year, et.month, et.day)) return false;
  const minutes = et.hour * 60 + et.minute;
  return minutes >= 4 * 60 && minutes < REGULAR_OPEN_MINUTES;
}

/** After-hours window (regular close–20:00 ET, including early-close days). */
export function isAfterHoursEt(t: Date = new Date()): boolean {
  const et = etParts(t);
  const close = marketCloseMinutes(et.year, et.month, et.day);
  if (close == null) return false;
  const minutes = et.hour * 60 + et.minute;
  return minutes >= close && minutes < 20 * 60;
}

/** Same-trading-day post-close research window (20:00–24:00 ET on trading days). */
export function isSameDayPostCloseResearchWindowEt(t: Date = new Date()): boolean {
  const et = etParts(t);
  const close = marketCloseMinutes(et.year, et.month, et.day);
  if (close == null) return false;
  const minutes = et.hour * 60 + et.minute;
  return minutes >= 20 * 60 && minutes < 24 * 60 && minutes >= close;
}

export type MarketSession = "pre-market" | "regular" | "after-hours" | "closed" | "weekend";

export function currentMarketSession(t: Date = new Date()): MarketSession {
  if (isWeekendEt(t)) return "weekend";
  if (isMarketHolidayEt(t)) return "closed";
  if (isPreMarketEt(t)) return "pre-market";
  if (isRegularSessionEt(t)) return "regular";
  if (isAfterHoursEt(t)) return "after-hours";
  return "closed";
}

/** Regular-session minutes elapsed as a fraction of that trading day's session.
 *  0 before the open, 1 at/after the close. Used to time-normalize relative
 *  volume so an early-session surge (e.g. 3× the volume expected by 09:40) is not
 *  masked by a small full-day RVol. Returns null on weekends and holidays. */
export function regularSessionFractionElapsed(t: Date = new Date()): number | null {
  const et = etParts(t);
  const close = marketCloseMinutes(et.year, et.month, et.day);
  if (close == null) return null;
  const minutes = et.hour * 60 + et.minute;
  if (minutes <= REGULAR_OPEN_MINUTES) return 0;
  if (minutes >= close) return 1;
  return (minutes - REGULAR_OPEN_MINUTES) / (close - REGULAR_OPEN_MINUTES);
}

/** Build the absolute instant at which the ET wall clock reads the given
 *  y/mo(1-12)/da hh:mm. DST-safe (derives the offset from the target instant). */
function etWallToUtc(y: number, mo: number, da: number, hh: number, mm: number): Date {
  const guess = Date.UTC(y, mo - 1, da, hh, mm);
  const asEt = new Date(new Date(guess).toLocaleString("en-US", { timeZone: TZ }));
  const asUtc = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = asUtc.getTime() - asEt.getTime();
  return new Date(guess + offset);
}

/**
 * The close of the PREVIOUS trading session relative to `now` (skips weekends
 * and exchange holidays, and honors early closes). Used as a session-aware cutoff
 * so the screener
 * surfaces the overnight / pre-market headline driving today's move — spanning
 * the weekend for a Monday — instead of a fixed 24h window that both misses
 * weekend catalysts and drags in stale prior-session coverage. */
export function previousTradingClose(now: Date = new Date()): Date {
  const et = etParts(now);
  for (let offset = -1; offset >= -10; offset--) {
    const candidate = utcDateParts(et.year, et.month, et.day, offset);
    const close = marketCloseMinutes(candidate.year, candidate.month, candidate.day);
    if (close == null) continue;
    return etWallToUtc(
      candidate.year,
      candidate.month,
      candidate.day,
      Math.floor(close / 60),
      close % 60,
    );
  }
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

/** Whole days (signed) from `a` to `b`, both interpreted at ET midnight. */
export function daysBetweenEt(a: string | Date, b: string | Date): number {
  const toUtcMidnightOfEt = (x: string | Date): number => {
    const iso = typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)
      ? x
      : etDateOnly(typeof x === "string" ? new Date(x) : x);
    return Date.parse(`${iso}T00:00:00Z`);
  };
  const am = toUtcMidnightOfEt(a);
  const bm = toUtcMidnightOfEt(b);
  if (!Number.isFinite(am) || !Number.isFinite(bm)) return 0;
  return Math.floor((bm - am) / 86_400_000);
}

// =============================================================================
// FOMC June 17, 2026 — anchor event timestamps. All in absolute (UTC) form.
// 14:00 ET → 18:00 UTC during EDT (June is daylight time).
// =============================================================================
export const FOMC_DECISION_AT_ISO = "2026-06-17T18:00:00Z";    // 14:00 ET
export const FOMC_PRESSER_END_ISO = "2026-06-17T19:00:00Z";    // ~15:00 ET
export const NVDA_EARNINGS_AT_ISO = "2026-08-27T20:00:00Z";    // est late-Aug AMC

export function isAfter(iso: string, now: Date = new Date()): boolean {
  return now.getTime() >= Date.parse(iso);
}
