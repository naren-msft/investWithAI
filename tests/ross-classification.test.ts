import assert from "node:assert/strict";
import test from "node:test";
import { LARGECAP_DEFAULTS, LARGECAP_PROFILE } from "@/config/largecap";
import { ROSS_DEFAULTS, ROSS_PROFILE, watchThresholdsOf } from "@/config/ross";
import {
  classifyStage,
  effectiveChangePct,
  effectivePrice,
  effectiveRvol,
  meetsAutomatedPillars,
  passesUniverse,
} from "@/lib/ross/classification";
import { evaluatePillars } from "@/lib/ross/pillars";
import type { RossCandidate } from "@/lib/ross/types";

function candidate(overrides: Partial<RossCandidate> = {}): RossCandidate {
  return {
    ticker: "TEST",
    name: "Test Company",
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
    source: "tradingview",
    ...overrides,
  };
}

test("known over-limit float cannot qualify", () => {
  const overFloat = candidate({ floatShares: ROSS_DEFAULTS.maxFloat });
  assert.equal(
    meetsAutomatedPillars(overFloat, ROSS_DEFAULTS, ROSS_PROFILE, "regular"),
    false,
  );
  assert.equal(
    classifyStage(
      overFloat,
      ROSS_DEFAULTS,
      watchThresholdsOf(ROSS_DEFAULTS),
      ROSS_PROFILE,
      "regular",
    ),
    "watch",
  );
  assert.equal(evaluatePillars(overFloat, ROSS_DEFAULTS).allAutomatedMet, false);
});

test("premarket qualification prefers vendor 5m RVOL over weak full-day RVOL", () => {
  const wetoLike = candidate({
    changePct: -5,
    premarketChangePct: 26,
    relativeVolume: 0.1389,
    rvolIntraday5m: 47.15,
    marketState: "PRE",
  });
  const sessionPrice = effectivePrice(wetoLike, "pre-market");
  const sessionChange = effectiveChangePct(wetoLike, "pre-market");
  const sessionRvol = effectiveRvol(wetoLike, "pre-market");
  const evaluation = evaluatePillars(
    wetoLike,
    ROSS_DEFAULTS,
    ROSS_PROFILE,
    sessionPrice,
    sessionChange,
    sessionRvol,
  );

  assert.equal(sessionRvol, 47.15);
  assert.equal(
    meetsAutomatedPillars(wetoLike, ROSS_DEFAULTS, ROSS_PROFILE, "pre-market"),
    true,
  );
  assert.equal(
    evaluation.pillars.find((pillar) => pillar.key === "rvol")?.value,
    "47.1×",
  );
  assert.equal(
    evaluation.pillars.find((pillar) => pillar.key === "rvol")?.status,
    "pass",
  );
});

test("premarket movers do not falsely qualify without a vendor intraday RVOL", () => {
  const wetoLike = candidate({
    changePct: -5,
    premarketChangePct: 26,
    relativeVolume: 0.1389,
    rvolIntraday5m: null,
    marketState: "PRE",
  });
  assert.equal(effectiveRvol(wetoLike, "pre-market"), 0.1389);
  assert.equal(
    meetsAutomatedPillars(wetoLike, ROSS_DEFAULTS, ROSS_PROFILE, "pre-market"),
    false,
  );
});

test("unknown float remains eligible but requires manual verification", () => {
  const unknownFloat = candidate({ floatShares: null });
  assert.equal(
    meetsAutomatedPillars(unknownFloat, ROSS_DEFAULTS, ROSS_PROFILE, "regular"),
    true,
  );
  const evaluation = evaluatePillars(unknownFloat, ROSS_DEFAULTS);
  assert.equal(evaluation.allAutomatedMet, true);
  assert.equal(evaluation.floatUnknown, true);
});

test("US-listed depositary receipts can pass while OTC depositary receipts stay excluded", () => {
  const nasdaqDr = candidate({
    ticker: "LFS",
    name: "LFS Depositary Receipt",
    exchange: "NASDAQ",
  });
  const otcDr = candidate({
    ticker: "LFSY",
    name: "LFS OTC Depositary Receipt",
    exchange: "OTC",
  });
  const watch = watchThresholdsOf(ROSS_DEFAULTS);

  assert.equal(passesUniverse(nasdaqDr, ROSS_DEFAULTS, ROSS_PROFILE, "regular"), true);
  assert.equal(
    classifyStage(nasdaqDr, ROSS_DEFAULTS, watch, ROSS_PROFILE, "regular"),
    "qualified",
  );
  assert.equal(
    meetsAutomatedPillars(nasdaqDr, ROSS_DEFAULTS, ROSS_PROFILE, "regular"),
    true,
  );

  assert.equal(passesUniverse(otcDr, ROSS_DEFAULTS, ROSS_PROFILE, "regular"), false);
  assert.equal(
    classifyStage(otcDr, ROSS_DEFAULTS, watch, ROSS_PROFILE, "regular"),
    null,
  );
  assert.equal(
    meetsAutomatedPillars(otcDr, ROSS_DEFAULTS, ROSS_PROFILE, "regular"),
    false,
  );
});

test("extended-session price and change use the same basis for qualification and Pillars 2/4", () => {
  const premarketMover = candidate({
    price: 0.95,
    premarketChangePct: 10,
  });

  test("after-hours gapper is watch-only when regular change and RVol miss Ross thresholds", () => {
    const gapper = candidate({
      changePct: -7.470288624787767,
      postmarketChangePct: 6.972477064220181,
      relativeVolume: 1.8145639105239666,
      marketState: "POST",
    });
    const watch = watchThresholdsOf(ROSS_DEFAULTS);
    assert.equal(
      meetsAutomatedPillars(gapper, ROSS_DEFAULTS, ROSS_PROFILE, "after-hours"),
      false,
    );
    assert.equal(
      classifyStage(gapper, ROSS_DEFAULTS, watch, ROSS_PROFILE, "after-hours"),
      "watch",
    );
  });
  const sessionPrice = effectivePrice(premarketMover, "pre-market");
  const sessionChange = effectiveChangePct(premarketMover, "pre-market");

  assert.equal(
    meetsAutomatedPillars(premarketMover, ROSS_DEFAULTS, ROSS_PROFILE, "pre-market"),
    true,
  );
  assert.equal(
    evaluatePillars(
      premarketMover,
      ROSS_DEFAULTS,
      ROSS_PROFILE,
      sessionPrice,
      sessionChange,
    ).allAutomatedMet,
    true,
  );
});

test("regular session keeps max(full-day, time-adjusted intraday) RVOL semantics", () => {
  const activeMover = candidate({
    relativeVolume: 1.4,
    intradayRvol: 7.2,
    rvolIntraday5m: 99,
  });
  assert.equal(effectiveRvol(activeMover, "regular"), 7.2);
});

test("AAOI-like large-cap candidate can qualify on pace-adjusted RVOL during the opening drive", () => {
  const aaoiLike = candidate({
    ticker: "AAOI",
    name: "Applied Optoelectronics",
    price: 132,
    changePct: 10.73,
    relativeVolume: 0.4,
    intradayRvol: 3.1,
    marketCap: 11_680_000_000,
    floatShares: 103_000_000,
  });
  const watch = watchThresholdsOf(LARGECAP_DEFAULTS);

  assert.equal(effectiveRvol(aaoiLike, "regular"), 3.1);
  assert.equal(
    meetsAutomatedPillars(
      aaoiLike,
      LARGECAP_DEFAULTS,
      LARGECAP_PROFILE,
      "regular",
    ),
    true,
  );
  assert.equal(
    classifyStage(
      aaoiLike,
      LARGECAP_DEFAULTS,
      watch,
      LARGECAP_PROFILE,
      "regular",
    ),
    "qualified",
  );
});

test("AAOI-like large-cap candidate with weak pace-adjusted RVOL stays excluded downstream", () => {
  const aaoiLike = candidate({
    ticker: "AAOI",
    name: "Applied Optoelectronics",
    price: 132,
    changePct: 10.73,
    relativeVolume: 0.4,
    intradayRvol: 0.6,
    marketCap: 11_680_000_000,
    floatShares: 103_000_000,
  });
  const watch = watchThresholdsOf(LARGECAP_DEFAULTS);

  assert.equal(effectiveRvol(aaoiLike, "regular"), 0.6);
  assert.equal(
    meetsAutomatedPillars(
      aaoiLike,
      LARGECAP_DEFAULTS,
      LARGECAP_PROFILE,
      "regular",
    ),
    false,
  );
  assert.equal(
    classifyStage(
      aaoiLike,
      LARGECAP_DEFAULTS,
      watch,
      LARGECAP_PROFILE,
      "regular",
    ),
    null,
  );
});

test("after-hours movers can qualify off the live change-from-close even when regular change was negative", () => {
  const akanLike = candidate({
    ticker: "AKAN",
    price: 5.389240829462388,
    changePct: -7.05,
    postmarketChangePct: 80.33,
    relativeVolume: 22.29,
    volume: 10_530_000,
    floatShares: 477_400,
    marketState: "POST",
  });
  const sessionPrice = effectivePrice(akanLike, "after-hours");
  const sessionChange = effectiveChangePct(akanLike, "after-hours");
  const watch = watchThresholdsOf(ROSS_DEFAULTS);
  const evaluation = evaluatePillars(
    akanLike,
    ROSS_DEFAULTS,
    ROSS_PROFILE,
    sessionPrice,
    sessionChange,
  );

  assert.ok(sessionPrice != null);
  assert.equal(Number(sessionPrice?.toFixed(2)), 9.72);
  assert.equal(sessionChange, 80.33);
  assert.equal(
    meetsAutomatedPillars(akanLike, ROSS_DEFAULTS, ROSS_PROFILE, "after-hours"),
    true,
  );
  assert.equal(
    classifyStage(akanLike, ROSS_DEFAULTS, watch, ROSS_PROFILE, "after-hours"),
    "qualified",
  );
  assert.equal(evaluation.allAutomatedMet, true);
  assert.equal(
    evaluation.pillars.find((pillar) => pillar.key === "change")?.status,
    "pass",
  );
});

test("same-day post-close research window keeps using postmarket basis after 20:00 ET", () => {
  const akanLike = candidate({
    ticker: "AKAN",
    price: 5.389240829462388,
    changePct: -7.05,
    postmarketChangePct: 80.33,
    relativeVolume: 22.29,
    volume: 10_530_000,
    floatShares: 477_400,
    marketState: "POSTPOST",
  });
  const at = new Date("2026-08-14T00:25:00Z");
  const sessionPrice = effectivePrice(akanLike, "closed", at);
  const sessionChange = effectiveChangePct(akanLike, "closed", at);
  const watch = watchThresholdsOf(ROSS_DEFAULTS);
  const evaluation = evaluatePillars(
    akanLike,
    ROSS_DEFAULTS,
    ROSS_PROFILE,
    sessionPrice,
    sessionChange,
  );

  assert.ok(sessionPrice != null);
  assert.equal(Number(sessionPrice.toFixed(2)), 9.72);
  assert.equal(sessionChange, 80.33);
  assert.equal(
    meetsAutomatedPillars(akanLike, ROSS_DEFAULTS, ROSS_PROFILE, "closed", at),
    true,
  );
  assert.equal(
    classifyStage(akanLike, ROSS_DEFAULTS, watch, ROSS_PROFILE, "closed", at),
    "qualified",
  );
  assert.equal(evaluation.allAutomatedMet, true);
});

test("after-hours preserves the full-day RVOL basis over any premarket-only 5m field", () => {
  const akanLike = candidate({
    changePct: -7.05,
    postmarketChangePct: 80.33,
    relativeVolume: 1.8,
    rvolIntraday5m: 22,
    marketState: "POST",
  });
  assert.equal(effectiveRvol(akanLike, "after-hours"), 1.8);
  assert.equal(
    meetsAutomatedPillars(akanLike, ROSS_DEFAULTS, ROSS_PROFILE, "after-hours"),
    false,
  );
});

test("19:59 ET still uses the standard after-hours basis before the session closes", () => {
  const akanLike = candidate({
    ticker: "AKAN",
    price: 5.389240829462388,
    changePct: -7.05,
    postmarketChangePct: 80.33,
    relativeVolume: 22.29,
    volume: 10_530_000,
    floatShares: 477_400,
    marketState: "POST",
  });
  const at = new Date("2026-08-13T23:59:00Z");

  assert.equal(effectiveChangePct(akanLike, "after-hours", at), 80.33);
  assert.equal(Number((effectivePrice(akanLike, "after-hours", at) ?? 0).toFixed(2)), 9.72);
  assert.equal(
    classifyStage(
      akanLike,
      ROSS_DEFAULTS,
      watchThresholdsOf(ROSS_DEFAULTS),
      ROSS_PROFILE,
      "after-hours",
      at,
    ),
    "qualified",
  );
});

test("closed overnight does not carry prior postmarket qualification into 00:30 ET", () => {
  const akanLike = candidate({
    ticker: "AKAN",
    price: 5.389240829462388,
    changePct: -7.05,
    postmarketChangePct: 80.33,
    relativeVolume: 22.29,
    volume: 10_530_000,
    floatShares: 477_400,
    marketState: "CLOSED",
  });
  const at = new Date("2026-08-14T04:30:00Z");
  const watch = watchThresholdsOf(ROSS_DEFAULTS);

  assert.equal(Number((effectivePrice(akanLike, "closed", at) ?? 0).toFixed(2)), 5.39);
  assert.equal(effectiveChangePct(akanLike, "closed", at), -7.05);
  assert.equal(
    meetsAutomatedPillars(akanLike, ROSS_DEFAULTS, ROSS_PROFILE, "closed", at),
    false,
  );
  assert.equal(
    classifyStage(akanLike, ROSS_DEFAULTS, watch, ROSS_PROFILE, "closed", at),
    null,
  );
});
