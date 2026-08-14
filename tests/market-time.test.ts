import assert from "node:assert/strict";
import test from "node:test";
import {
  currentMarketSession,
  isAfterHoursEt,
  isMarketHolidayEt,
  isSameDayPostCloseResearchWindowEt,
  previousTradingClose,
  regularSessionFractionElapsed,
} from "@/lib/marketTime";

test("treats exchange holidays as closed sessions", () => {
  const goodFriday = new Date("2026-04-03T15:00:00Z");
  assert.equal(isMarketHolidayEt(goodFriday), true);
  assert.equal(currentMarketSession(goodFriday), "closed");
  assert.equal(regularSessionFractionElapsed(goodFriday), null);
});

test("does not invent an early close before an observed holiday weekend", () => {
  const mondayAfterIndependenceDay = new Date("2026-07-06T12:00:00Z");
  assert.equal(
    previousTradingClose(mondayAfterIndependenceDay).toISOString(),
    "2026-07-02T20:00:00.000Z",
  );
});

test("honors the 13:00 ET close after Thanksgiving", () => {
  const twoPmEt = new Date("2026-11-27T19:00:00Z");
  assert.equal(regularSessionFractionElapsed(twoPmEt), 1);
  assert.equal(isAfterHoursEt(twoPmEt), true);
  assert.equal(currentMarketSession(twoPmEt), "after-hours");
});

test("same-day post-close research window is limited to trading-day evenings", () => {
  const weekdayResearchWindow = new Date("2026-08-14T00:25:00Z"); // Thu 20:25 ET
  const beforeEightPmEt = new Date("2026-08-13T23:59:00Z"); // Thu 19:59 ET
  const overnightClosed = new Date("2026-08-14T04:30:00Z"); // Fri 00:30 ET
  const weekendEvening = new Date("2026-08-16T00:25:00Z"); // Sat 20:25 ET
  const holidayEvening = new Date("2026-07-04T00:25:00Z"); // Fri Jul 3 20:25 ET (observed holiday)

  assert.equal(currentMarketSession(weekdayResearchWindow), "closed");
  assert.equal(isSameDayPostCloseResearchWindowEt(weekdayResearchWindow), true);
  assert.equal(currentMarketSession(beforeEightPmEt), "after-hours");
  assert.equal(isSameDayPostCloseResearchWindowEt(beforeEightPmEt), false);
  assert.equal(isSameDayPostCloseResearchWindowEt(overnightClosed), false);
  assert.equal(isSameDayPostCloseResearchWindowEt(weekendEvening), false);
  assert.equal(isSameDayPostCloseResearchWindowEt(holidayEvening), false);
});
