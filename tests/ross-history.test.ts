import assert from "node:assert/strict";
import test from "node:test";
import { ALIGNMENT_HISTORY_MIN_MS, applyTickerUpdate } from "@/lib/ross/history";
import type { RossRow } from "@/lib/ross/types";

const T0 = "2026-08-05T09:35:00.000Z";
const T1 = "2026-08-05T09:36:00.000Z";
const T2 = "2026-08-05T09:38:00.000Z";

type InputRow = Pick<
  RossRow,
  | "ticker"
  | "candidate"
  | "currentChangePct"
  | "currentRvol"
  | "stage"
  | "allAutomatedMet"
  | "extendedChangePct"
>;

function baseCandidate() {
  return {
    ticker: "TEST",
    name: "Test Co",
    exchange: "NASDAQ",
    price: 5,
    changePct: 12,
    relativeVolume: 6,
    volume: 1_000_000,
    avgVolume: 200_000,
    floatShares: 5_000_000,
    marketCap: 50_000_000,
    premarketChangePct: null,
    postmarketChangePct: null,
    marketState: "REGULAR",
    source: "tradingview" as const,
  };
}

function row(overrides: Partial<InputRow> = {}): InputRow {
  return {
    ticker: "TEST",
    candidate: baseCandidate(),
    currentChangePct: 12,
    currentRvol: 6,
    stage: "qualified",
    allAutomatedMet: true,
    extendedChangePct: null,
    ...overrides,
  };
}

function rowWith(changePct: number, relativeVolume: number): InputRow {
  return row({
    candidate: { ...baseCandidate(), changePct, relativeVolume },
    currentChangePct: changePct,
    currentRvol: relativeVolume,
  });
}

test("first appearance initializes qualification history", () => {
  const history = applyTickerUpdate(undefined, row(), T0);
  assert.equal(history.firstSeenAt, T0);
  assert.equal(history.firstQualifiedAt, T0);
  assert.equal(history.qualifiedSeenCount, 1);
  assert.equal(history.everGreen, true);
});

test("watch appearance initializes watch history without qualification", () => {
  const history = applyTickerUpdate(
    undefined,
    row({ stage: "watch", allAutomatedMet: false }),
    T0,
  );
  assert.equal(history.firstWatchAt, T0);
  assert.equal(history.firstQualifiedAt, null);
  assert.equal(history.qualifiedSeenCount, 0);
});

test("watch fallback preserves firstQualifiedAt and resets the qualification streak", () => {
  const qualified = applyTickerUpdate(undefined, row(), T0);
  const watch = applyTickerUpdate(
    qualified,
    row({ stage: "watch", allAutomatedMet: false }),
    T1,
  );
  assert.equal(watch.firstQualifiedAt, T0);
  assert.equal(watch.qualifiedSeenCount, 0);
  assert.equal(watch.peakQualifiedChangePct, null);
});

test("requalification keeps the original firstQualifiedAt", () => {
  const first = applyTickerUpdate(undefined, row(), T0);
  const watch = applyTickerUpdate(
    first,
    row({ stage: "watch", allAutomatedMet: false }),
    T1,
  );
  const requalified = applyTickerUpdate(watch, row(), T2);
  assert.equal(requalified.firstQualifiedAt, T0);
  assert.equal(requalified.qualifiedSeenCount, 1);
});

test("acceleration readings shift only after the minimum history interval", () => {
  assert.ok(ALIGNMENT_HISTORY_MIN_MS > 0);
  const first = applyTickerUpdate(undefined, rowWith(12, 6), T0);
  const rapid = applyTickerUpdate(first, rowWith(13, 7), T1);
  assert.equal(rapid.prevChangePct, null);
  assert.equal(rapid.lastChangePct, 13);

  const elapsed = applyTickerUpdate(rapid, rowWith(14, 8), T2);
  assert.equal(elapsed.prevChangePct, 13);
  assert.equal(elapsed.lastChangePct, 14);
});

test("history stores the effective RVol instead of the weak full-day candidate RVol", () => {
  const history = applyTickerUpdate(
    undefined,
    row({
      currentRvol: 47.15,
      candidate: { ...baseCandidate(), relativeVolume: 0.1389 },
    }),
    T0,
  );
  assert.equal(history.lastRvol, 47.15);
});
