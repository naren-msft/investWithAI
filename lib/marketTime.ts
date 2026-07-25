// Market-time helpers — US equities in ET (handles DST). All FOMC playbook
// gates and labels go through these so we don't accidentally compare UTC
// midnight against a 2pm-ET announcement window.

const TZ = "America/New_York";

export function nowEt(): Date { return new Date(); }

/** Convert any date to its YYYY-MM-DD in ET. */
export function etDateOnly(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** True if `t` falls on a US weekend (Sat or Sun in ET). */
export function isWeekendEt(t: Date = new Date()): boolean {
  const dow = new Date(t.toLocaleString("en-US", { timeZone: TZ })).getDay();
  return dow === 0 || dow === 6;
}

/** True if `t` is during regular trading hours (09:30–16:00 ET) on a weekday. */
export function isRegularSessionEt(t: Date = new Date()): boolean {
  const et = new Date(t.toLocaleString("en-US", { timeZone: TZ }));
  const dow = et.getDay();
  if (dow === 0 || dow === 6) return false;
  const minutes = et.getHours() * 60 + et.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

/** Pre-market window (04:00–09:30 ET). */
export function isPreMarketEt(t: Date = new Date()): boolean {
  const et = new Date(t.toLocaleString("en-US", { timeZone: TZ }));
  const dow = et.getDay();
  if (dow === 0 || dow === 6) return false;
  const minutes = et.getHours() * 60 + et.getMinutes();
  return minutes >= 4 * 60 && minutes < 9 * 60 + 30;
}

/** After-hours window (16:00–20:00 ET). */
export function isAfterHoursEt(t: Date = new Date()): boolean {
  const et = new Date(t.toLocaleString("en-US", { timeZone: TZ }));
  const dow = et.getDay();
  if (dow === 0 || dow === 6) return false;
  const minutes = et.getHours() * 60 + et.getMinutes();
  return minutes >= 16 * 60 && minutes < 20 * 60;
}

export type MarketSession = "pre-market" | "regular" | "after-hours" | "closed" | "weekend";

export function currentMarketSession(t: Date = new Date()): MarketSession {
  if (isWeekendEt(t)) return "weekend";
  if (isPreMarketEt(t)) return "pre-market";
  if (isRegularSessionEt(t)) return "regular";
  if (isAfterHoursEt(t)) return "after-hours";
  return "closed";
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
