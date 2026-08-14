import assert from "node:assert/strict";
import test from "node:test";
import { buildSignalAlignment } from "@/lib/ross/alignment";
import type { TickerHistory } from "@/lib/ross/history";
import type { RossCandidate, RossRow } from "@/lib/ross/types";

const asOf = "2026-08-05T12:10:00.000Z";
const newsSince = "2026-08-04T20:00:00.000Z";

function candidate(): RossCandidate {
  return {
    ticker: "TEST",
    name: "Test Company",
    exchange: "NASDAQ",
    price: 5,
    changePct: 14,
    relativeVolume: 6,
    volume: 1_000_000,
    avgVolume: 200_000,
    floatShares: 5_000_000,
    marketCap: 50_000_000,
    premarketChangePct: 4,
    postmarketChangePct: null,
    marketState: "PRE",
    source: "tradingview",
  };
}

function row(overrides: Partial<RossRow> = {}): RossRow {
  const nextCandidate = overrides.candidate ?? candidate();
  return {
    ticker: "TEST",
    name: "Test Company",
    candidate: nextCandidate,
    currentPrice: overrides.currentPrice ?? nextCandidate.price,
    currentChangePct: overrides.currentChangePct ?? nextCandidate.changePct,
    currentRvol: overrides.currentRvol ?? nextCandidate.relativeVolume,
    stage: "qualified",
    pillars: [],
    allAutomatedMet: true,
    strongMomentum: true,
    floatUnknown: false,
    extendedRising: true,
    extendedChangePct: 4,
    extendedSession: "premarket",
    tradingViewSymbol: "NASDAQ:TEST",
    chartUrl: "https://example.com/chart",
    news: [
      {
        title: "Test Company wins contract",
        link: "https://example.com/news",
        publishedAt: Date.parse("2026-08-05T11:30:00.000Z"),
        source: "yahoo",
      },
    ],
    googleFinanceUrl: "https://example.com/finance",
    ...overrides,
  };
}

function history(): TickerHistory {
  return {
    ticker: "TEST",
    firstSeenAt: "2026-08-05T12:06:00.000Z",
    lastSeenAt: asOf,
    seenCount: 2,
    peakChangePct: 15,
    peakExtendedPct: 4,
    lastChangePct: 14,
    lastRvol: 6,
    prevChangePct: 13,
    prevRvol: 5,
    lastObservedAt: asOf,
    prevObservedAt: "2026-08-05T12:07:00.000Z",
    firstWatchAt: null,
    firstQualifiedAt: "2026-08-05T12:06:00.000Z",
    qualifiedSeenCount: 2,
    peakQualifiedChangePct: 15,
    everGreen: true,
  };
}

test("aligns all four qualified pre-market signals when evidence is sufficient", () => {
  const alignment = buildSignalAlignment(row(), history(), "pre-market", newsSince, asOf);
  assert.equal(alignment?.alignedCount, 4);
  assert.equal(alignment?.knownCount, 4);
  assert.equal(alignment?.confidence, "normal");
});

test("regular-session pre-market data is stale and earns no alignment point", () => {
  const alignment = buildSignalAlignment(row(), history(), "regular", newsSince, asOf);
  const extended = alignment?.signals.find((signal) => signal.key === "extendedContinuation");
  assert.equal(extended?.state, "not-aligned");
  assert.match(extended?.detail ?? "", /stale/i);
  assert.equal(alignment?.alignedCount, 3);
});

test("post-close research window still treats same-day postmarket continuation as live", () => {
  const afterCloseAsOf = "2026-08-14T00:25:00.000Z";
  const alignment = buildSignalAlignment(
    row({
      currentPrice: 9.72,
      currentChangePct: 80.33,
      extendedRising: true,
      extendedChangePct: 80.33,
      extendedSession: "afterhours",
      candidate: {
        ...candidate(),
        changePct: -7.05,
        premarketChangePct: null,
        postmarketChangePct: 80.33,
        marketState: "POSTPOST",
      },
    }),
    history(),
    "closed",
    newsSince,
    afterCloseAsOf,
  );
  const extended = alignment?.signals.find((signal) => signal.key === "extendedContinuation");
  assert.equal(extended?.state, "aligned");
  assert.match(extended?.detail ?? "", /active extended session is up 80\.3%/i);
});

test("insufficient history stays unknown and unknown float lowers confidence", () => {
  const alignment = buildSignalAlignment(
    row({ floatUnknown: true }),
    { ...history(), qualifiedSeenCount: 1, prevObservedAt: null, prevRvol: null },
    "pre-market",
    newsSince,
    asOf,
  );
  assert.equal(alignment?.knownCount, 2);
  assert.equal(alignment?.confidence, "low");
  assert.equal(
    alignment?.signals.filter((signal) => signal.state === "unknown").length,
    2,
  );
});

test("watch rows do not receive a signal alignment", () => {
  assert.equal(
    buildSignalAlignment(
      row({ stage: "watch", allAutomatedMet: false }),
      history(),
      "pre-market",
      newsSince,
      asOf,
    ),
    null,
  );
});
