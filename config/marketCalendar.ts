/**
 * NYSE market calendar — full closes and early closes (1:00pm ET).
 *
 * MAINTENANCE: extend this list each year. NYSE publishes the official
 * schedule at https://www.nyse.com/markets/hours-calendars. Dates here
 * are interpreted as wall-clock dates in America/New_York.
 *
 * `type`:
 *   - "closed"      → market fully closed for the day
 *   - "early-close" → market closes at 1:00pm ET (instead of 4:00pm ET)
 */

export type MarketHolidayType = "closed" | "early-close";

export interface MarketHoliday {
  date: string; // YYYY-MM-DD in America/New_York
  name: string;
  type: MarketHolidayType;
}

export const NYSE_HOLIDAYS: MarketHoliday[] = [
  // ---- 2025 ----
  { date: "2025-01-01", name: "New Year's Day",            type: "closed" },
  { date: "2025-01-20", name: "Martin Luther King Jr. Day", type: "closed" },
  { date: "2025-02-17", name: "Presidents' Day",           type: "closed" },
  { date: "2025-04-18", name: "Good Friday",               type: "closed" },
  { date: "2025-05-26", name: "Memorial Day",              type: "closed" },
  { date: "2025-06-19", name: "Juneteenth",                type: "closed" },
  { date: "2025-07-03", name: "Day before Independence Day", type: "early-close" },
  { date: "2025-07-04", name: "Independence Day",          type: "closed" },
  { date: "2025-09-01", name: "Labor Day",                 type: "closed" },
  { date: "2025-11-27", name: "Thanksgiving Day",          type: "closed" },
  { date: "2025-11-28", name: "Day after Thanksgiving",    type: "early-close" },
  { date: "2025-12-24", name: "Christmas Eve",             type: "early-close" },
  { date: "2025-12-25", name: "Christmas Day",             type: "closed" },

  // ---- 2026 ----
  { date: "2026-01-01", name: "New Year's Day",            type: "closed" },
  { date: "2026-01-19", name: "Martin Luther King Jr. Day", type: "closed" },
  { date: "2026-02-16", name: "Presidents' Day",           type: "closed" },
  { date: "2026-04-03", name: "Good Friday",               type: "closed" },
  { date: "2026-05-25", name: "Memorial Day",              type: "closed" },
  { date: "2026-06-19", name: "Juneteenth",                type: "closed" },
  { date: "2026-07-03", name: "Independence Day (observed)", type: "closed" },
  { date: "2026-09-07", name: "Labor Day",                 type: "closed" },
  { date: "2026-11-26", name: "Thanksgiving Day",          type: "closed" },
  { date: "2026-11-27", name: "Day after Thanksgiving",    type: "early-close" },
  { date: "2026-12-24", name: "Christmas Eve",             type: "early-close" },
  { date: "2026-12-25", name: "Christmas Day",             type: "closed" },

  // ---- 2027 ----
  { date: "2027-01-01", name: "New Year's Day",            type: "closed" },
  { date: "2027-01-18", name: "Martin Luther King Jr. Day", type: "closed" },
  { date: "2027-02-15", name: "Presidents' Day",           type: "closed" },
  { date: "2027-03-26", name: "Good Friday",               type: "closed" },
  { date: "2027-05-31", name: "Memorial Day",              type: "closed" },
  { date: "2027-06-18", name: "Juneteenth (observed)",     type: "closed" },
  { date: "2027-07-05", name: "Independence Day (observed)", type: "closed" },
  { date: "2027-09-06", name: "Labor Day",                 type: "closed" },
  { date: "2027-11-25", name: "Thanksgiving Day",          type: "closed" },
  { date: "2027-11-26", name: "Day after Thanksgiving",    type: "early-close" },
  { date: "2027-12-24", name: "Christmas Eve (observed)",  type: "closed" },
];

const HOLIDAY_INDEX: Record<string, MarketHoliday> = Object.fromEntries(
  NYSE_HOLIDAYS.map((h) => [h.date, h]),
);

export function lookupHoliday(isoDate: string): MarketHoliday | undefined {
  return HOLIDAY_INDEX[isoDate];
}
