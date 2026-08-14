import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateNews,
  applyDashboardFilter,
  continuationRows,
  freshStatus,
  filteredHighOfDayRows,
  highOfDayRows,
  summarizePillars,
} from "@/lib/ross/dashboardHelpers";
import type {
  PillarResult,
  PillarStatus,
  RossNewsItem,
  RossRow,
  RossSignalAlignment,
} from "@/lib/ross/types";

function candidate(changePct: number | null = 12) {
  return {
    ticker: "TEST",
    name: "Test Co",
    exchange: "NASDAQ",
    price: 5,
    changePct,
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

function alignment(alignedCount: number): RossSignalAlignment {
  return {
    alignedCount,
    knownCount: 4,
    total: 4,
    confidence: "normal",
    signals: [],
  };
}

function row(overrides: Partial<RossRow> = {}): RossRow {
  const nextCandidate = overrides.candidate ?? candidate();
  return {
    ticker: "TEST",
    name: "Test Co",
    candidate: nextCandidate,
    currentPrice: overrides.currentPrice ?? nextCandidate.price,
    currentChangePct: overrides.currentChangePct ?? nextCandidate.changePct,
    currentRvol: overrides.currentRvol ?? nextCandidate.relativeVolume,
    stage: "qualified",
    pillars: [],
    allAutomatedMet: true,
    strongMomentum: false,
    floatUnknown: false,
    extendedRising: false,
    extendedChangePct: null,
    extendedSession: null,
    tradingViewSymbol: "NASDAQ:TEST",
    chartUrl: "https://example.com/chart",
    googleFinanceUrl: "https://example.com/quote",
    news: [],
    signalAlignment: null,
    ...overrides,
  };
}

function newsItem(link: string, publishedAt?: number): RossNewsItem {
  return { title: link, link, source: "finnhub", publishedAt };
}

function rossPillars(
  overrides: Partial<Record<PillarResult["key"], PillarStatus>> = {},
): PillarResult[] {
  return [
    {
      key: "rvol",
      label: "Relative Volume",
      status: overrides.rvol ?? "pass",
      automated: true,
      value: "6.0×",
      detail: "≥ 5× vs 30-day average",
    },
    {
      key: "change",
      label: "Daily % Change",
      status: overrides.change ?? "pass",
      automated: true,
      value: "+12.0%",
      detail: "≥ +10% from prev close",
    },
    {
      key: "catalyst",
      label: "News Catalyst",
      status: overrides.catalyst ?? "pass",
      automated: false,
      value: "🔥 likely",
      detail: "Likely catalyst; confirm manually",
    },
    {
      key: "price",
      label: "Price Range",
      status: overrides.price ?? "pass",
      automated: true,
      value: "$5.00",
      detail: "$1–$20 sweet spot",
    },
    {
      key: "float",
      label: "Float",
      status: overrides.float ?? "pass",
      automated: true,
      value: "5.0M",
      detail: "< 10M shares",
    },
  ];
}

test("summarizePillars returns all-pillars copy only when every pillar passes", () => {
  assert.equal(
    summarizePillars(rossPillars()),
    "All pillars matched",
  );
});

test("summarizePillars reports failed Ross pillars without treating them as passed", () => {
  assert.equal(
    summarizePillars(rossPillars({ change: "fail" })),
    "4/5 passed · Failed: Daily % Change",
  );
});

test("summarizePillars lists verify pillars for N/A statuses", () => {
  assert.equal(
    summarizePillars(
      rossPillars({
        catalyst: "na",
        float: "na",
      }),
    ),
    "3/5 passed · Verify: Catalyst, Float",
  );
});

test("freshStatus uses firstQualifiedAt for newly qualified rows", () => {
  const status = freshStatus(
    row({
      stage: "qualified",
      firstSeenAt: "2026-08-13T13:00:00.000Z",
      firstQualifiedAt: "2026-08-13T13:18:00.000Z",
    }),
    Date.parse("2026-08-13T13:30:00.000Z"),
  );
  assert.deepEqual(status, {
    stage: "qualified",
    label: "New Qualified",
    freshAt: "2026-08-13T13:18:00.000Z",
    firstWatchAt: "2026-08-13T13:00:00.000Z",
    firstQualifiedAt: "2026-08-13T13:18:00.000Z",
  });
});

test("freshStatus uses firstWatchAt for watch rows and does not mark stale watch rows fresh", () => {
  const recentWatch = freshStatus(
    row({
      stage: "watch",
      firstSeenAt: "2026-08-13T13:00:00.000Z",
      firstWatchAt: "2026-08-13T13:16:00.000Z",
      firstQualifiedAt: "2026-08-13T13:10:00.000Z",
    }),
    Date.parse("2026-08-13T13:30:00.000Z"),
  );
  assert.deepEqual(recentWatch, {
    stage: "watch",
    label: "New Watch",
    freshAt: "2026-08-13T13:16:00.000Z",
    firstWatchAt: "2026-08-13T13:16:00.000Z",
    firstQualifiedAt: "2026-08-13T13:10:00.000Z",
  });

  assert.equal(
    freshStatus(
      row({
        stage: "watch",
        firstSeenAt: "2026-08-13T13:00:00.000Z",
        firstWatchAt: "2026-08-13T13:05:00.000Z",
      }),
      Date.parse("2026-08-13T13:30:00.000Z"),
    ),
    null,
  );
});

test("highOfDayRows keeps qualified rows and sorts by peak change", () => {
  const rows = [
    row({
      ticker: "A",
      peakChangePct: 18,
      candidate: candidate(18),
    }),
    row({
      ticker: "B",
      peakChangePct: 22,
      candidate: candidate(22),
    }),
    row({
      ticker: "C",
      allAutomatedMet: false,
      peakChangePct: 30,
      candidate: candidate(30),
    }),
  ];
  assert.deepEqual(
    highOfDayRows(rows).map((item) => item.ticker),
    ["B", "A"],
  );
});

test("highOfDayRows falls back to current change when peak is unavailable", () => {
  const rows = [
    row({
      ticker: "A",
      peakChangePct: null,
      candidate: candidate(14),
    }),
    row({
      ticker: "B",
      peakChangePct: 11,
      candidate: candidate(11),
    }),
  ];
  assert.equal(highOfDayRows(rows)[0].ticker, "A");
});

test("filteredHighOfDayRows supports all high-of-day filter modes", () => {
  const rows = [
    row({
      ticker: "GREEN",
      peakChangePct: 18,
      candidate: candidate(18),
    }),
    row({
      ticker: "WATCH",
      stage: "watch",
      allAutomatedMet: false,
      peakChangePct: 30,
      candidate: candidate(30),
    }),
    row({
      ticker: "RISING_WATCH",
      stage: "watch",
      allAutomatedMet: false,
      extendedRising: true,
      peakChangePct: 24,
      candidate: candidate(24),
    }),
    row({
      ticker: "RISING_GREEN",
      extendedRising: true,
      peakChangePct: 22,
      candidate: candidate(22),
    }),
  ];

  assert.deepEqual(
    filteredHighOfDayRows(rows, "all").map((item) => item.ticker),
    ["WATCH", "RISING_WATCH", "RISING_GREEN", "GREEN"],
  );
  assert.deepEqual(
    filteredHighOfDayRows(rows, "green").map((item) => item.ticker),
    ["RISING_GREEN", "GREEN"],
  );
  assert.deepEqual(
    filteredHighOfDayRows(rows, "watch").map((item) => item.ticker),
    ["WATCH", "RISING_WATCH"],
  );
  assert.deepEqual(
    filteredHighOfDayRows(rows, "rising").map((item) => item.ticker),
    ["RISING_WATCH", "RISING_GREEN"],
  );
});

test("filteredHighOfDayRows sorts by peak change, falls back to change, and respects limit", () => {
  const rows = [
    row({
      ticker: "PEAK",
      stage: "watch",
      allAutomatedMet: false,
      peakChangePct: 23,
      candidate: candidate(10),
    }),
    row({
      ticker: "FALLBACK",
      stage: "watch",
      allAutomatedMet: false,
      peakChangePct: null,
      candidate: candidate(21),
    }),
    row({
      ticker: "LOWER",
      stage: "watch",
      allAutomatedMet: false,
      peakChangePct: 19,
      candidate: candidate(19),
    }),
  ];

  assert.deepEqual(
    filteredHighOfDayRows(rows, "all", 2).map((item) => item.ticker),
    ["PEAK", "FALLBACK"],
  );
});

test("continuationRows includes aligned and accelerating watch rows", () => {
  const rows = [
    row({
      ticker: "ALIGNED",
      signalAlignment: alignment(3),
    }),
    row({
      ticker: "WATCH",
      stage: "watch",
      allAutomatedMet: false,
      accelScore: 1.5,
    }),
    row({
      ticker: "WEAK",
      allAutomatedMet: false,
    }),
  ];
  assert.deepEqual(
    continuationRows(rows).map((item) => item.ticker),
    ["ALIGNED", "WATCH"],
  );
});

test("dashboard filters select the expected rows", () => {
  const rows = [
    row({ ticker: "GREEN" }),
    row({
      ticker: "WATCH",
      stage: "watch",
      allAutomatedMet: false,
    }),
    row({
      ticker: "NEWS",
      news: [newsItem("https://example.com/news")],
    }),
  ];
  assert.deepEqual(
    applyDashboardFilter(rows, "watch").map((item) => item.ticker),
    ["WATCH"],
  );
  assert.deepEqual(
    applyDashboardFilter(rows, "news").map((item) => item.ticker),
    ["NEWS"],
  );
});

test("aggregateNews deduplicates links and sorts newest first", () => {
  const rows = [
    row({
      ticker: "A",
      news: [newsItem("https://example.com/shared", 1_000)],
    }),
    row({
      ticker: "B",
      news: [
        newsItem("https://example.com/shared", 1_000),
        newsItem("https://example.com/new", 9_000),
      ],
    }),
  ];
  const items = aggregateNews(rows);
  assert.equal(items.length, 2);
  assert.equal(items[0].link, "https://example.com/new");
  assert.equal(items[0].ticker, "B");
});
