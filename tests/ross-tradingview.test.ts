import assert from "node:assert/strict";
import test from "node:test";
import { LARGECAP_DEFAULTS, LARGECAP_PROFILE } from "@/config/largecap";
import { ROSS_DEFAULTS, ROSS_LANE_LIMITS, ROSS_PROFILE } from "@/config/ross";
import {
  buildTradingViewLaneRequests,
  laneWarningsOf,
  tradingViewGapField,
  type TradingViewLaneStatus,
} from "@/lib/ross/tradingview";

test("successful lanes produce no warnings", () => {
  const statuses: TradingViewLaneStatus[] = [
    { name: "qualified", ok: true, count: 5 },
    { name: "watch", ok: true, count: 10 },
  ];
  assert.deepEqual(laneWarningsOf(statuses), []);
});

test("failed lanes produce specific incomplete-universe warnings", () => {
  const statuses: TradingViewLaneStatus[] = [
    { name: "qualified", ok: true, count: 5 },
    { name: "watch", ok: false, count: 0 },
    { name: "gap", ok: false, count: 0 },
  ];
  const warnings = laneWarningsOf(statuses);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /watch/);
  assert.match(warnings[1], /gap/);
});

test("absence of a regular-session gap lane produces no warning", () => {
  const statuses: TradingViewLaneStatus[] = [
    { name: "qualified", ok: true, count: 3 },
    { name: "watch", ok: true, count: 7 },
  ];
  assert.deepEqual(laneWarningsOf(statuses), []);
});

test("closed-session gap lane only runs during the same-day post-close research window", () => {
  assert.equal(
    tradingViewGapField("closed", new Date("2026-08-14T00:25:00Z")),
    "postmarket_change",
  );
  assert.equal(
    tradingViewGapField("closed", new Date("2026-08-13T23:59:00Z")),
    null,
  );
  assert.equal(
    tradingViewGapField("closed", new Date("2026-08-14T04:30:00Z")),
    null,
  );
  assert.equal(
    tradingViewGapField("closed", new Date("2026-08-16T00:25:00Z")),
    null,
  );
  assert.equal(
    tradingViewGapField("closed", new Date("2026-07-04T00:25:00Z")),
    null,
  );
});

test("active sessions keep their existing TradingView gap lane selection", () => {
  assert.equal(
    tradingViewGapField("pre-market", new Date("2026-08-05T12:10:00Z")),
    "premarket_change",
  );
  assert.equal(
    tradingViewGapField("after-hours", new Date("2026-08-05T23:10:00Z")),
    "postmarket_change",
  );
  assert.equal(
    tradingViewGapField("regular", new Date("2026-08-05T15:10:00Z")),
    null,
  );
});

test("opening-drive lane only runs during the first regular-session hour", () => {
  assert.deepEqual(
    buildTradingViewLaneRequests(
      LARGECAP_DEFAULTS,
      LARGECAP_PROFILE,
      "regular",
      new Date("2026-08-13T14:20:00Z"),
    ).map((request) => request.name),
    ["qualified", "opening-drive", "watch"],
  );
  assert.deepEqual(
    buildTradingViewLaneRequests(
      LARGECAP_DEFAULTS,
      LARGECAP_PROFILE,
      "pre-market",
      new Date("2026-08-13T13:00:00Z"),
    ).map((request) => request.name),
    ["qualified", "watch", "gap"],
  );
  assert.deepEqual(
    buildTradingViewLaneRequests(
      LARGECAP_DEFAULTS,
      LARGECAP_PROFILE,
      "regular",
      new Date("2026-08-13T14:31:00Z"),
    ).map((request) => request.name),
    ["qualified", "watch"],
  );
  assert.deepEqual(
    buildTradingViewLaneRequests(
      LARGECAP_DEFAULTS,
      LARGECAP_PROFILE,
      "closed",
      new Date("2026-08-14T04:30:00Z"),
    ).map((request) => request.name),
    ["qualified", "watch"],
  );
});

test("opening-drive lane omits the coarse RVOL prefilter and stays capped at 50 rows", () => {
  const requests = buildTradingViewLaneRequests(
    LARGECAP_DEFAULTS,
    LARGECAP_PROFILE,
    "regular",
    new Date("2026-08-13T14:05:00Z"),
  );
  const openingDrive = requests.find(
    (request) => request.name === "opening-drive",
  );

  assert.ok(openingDrive);
  if (!openingDrive) return;
  assert.equal(openingDrive.body.sort.sortBy, "change");
  assert.equal(openingDrive.body.range[1], ROSS_LANE_LIMITS.openingDrive);
  assert.equal(
    openingDrive.body.filter.some(
      (filter) => filter.left === "relative_volume_10d_calc",
    ),
    false,
  );
});

test("gap lane uses the same 50-row cap as the other TradingView lanes", () => {
  assert.equal(ROSS_LANE_LIMITS.gap, 50);
  assert.equal(ROSS_LANE_LIMITS.gap, ROSS_LANE_LIMITS.watch);
  assert.equal(ROSS_LANE_LIMITS.gap, ROSS_LANE_LIMITS.qualified);
  assert.equal(ROSS_LANE_LIMITS.gap, ROSS_LANE_LIMITS.openingDrive);
});

test("all TradingView lane request bodies include exactly stock and depositary-receipt types", () => {
  const laneSets = [
    buildTradingViewLaneRequests(ROSS_DEFAULTS, ROSS_PROFILE, "pre-market"),
    buildTradingViewLaneRequests(LARGECAP_DEFAULTS, LARGECAP_PROFILE, "pre-market"),
  ];

  for (const requests of laneSets) {
    assert.deepEqual(
      requests.map((request) => request.name),
      ["qualified", "watch", "gap"],
    );
    for (const request of requests) {
      assert.deepEqual(request.body.symbols.query.types, ["stock", "dr"]);
      assert.deepEqual(request.body.symbols.tickers, []);
    }
  }
});
