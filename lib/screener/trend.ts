import { sma, smaSeries, rsi, macd } from "@/lib/indicators";
import { relativeStrength, frogInPan, volumeThrust, baseLength, momentum20d } from "./momentum";
import type { GateCheck, GateResult, ScreenerEarlyTrend, ScreenerMode, ScreenerTrend } from "./types";
import type { ThemeTag } from "@/config/screener-themes";

export interface TrendInputs {
  closes: number[];
  volumes?: number[];
  benchCloses?: number[];
}

export function computeTrend(input: TrendInputs | number[]): ScreenerTrend | null {
  // Back-compat: accept either bare closes[] (legacy) or {closes, volumes, benchCloses}.
  const inputs: TrendInputs = Array.isArray(input) ? { closes: input } : input;
  const { closes, volumes, benchCloses } = inputs;
  if (closes.length < 200) return null;

  const sma50 = sma(closes, 50);
  const sma150 = sma(closes, 150);
  const sma200 = sma(closes, 200);
  const sma200Series = smaSeries(closes, 200);

  const recent = sma200Series[sma200Series.length - 1];
  const older = sma200Series[sma200Series.length - 21] ?? recent;
  const sma200Slope = recent - older;

  const r = rsi(closes, 14);
  const m = macd(closes);
  const prevM = macd(closes.slice(0, -1));
  const macdHistRising = Number.isFinite(m.hist) && Number.isFinite(prevM.hist) && m.hist > prevM.hist;

  const price = closes[closes.length - 1];
  const last252 = closes.slice(-252);
  const high52w = Math.max(...last252);
  const low52w = Math.min(...last252);

  const c1 = price > sma150 && price > sma200;
  const c2 = sma150 > sma200;
  const c3 = sma200Slope > 0;
  const c4 = sma50 > sma150 && sma50 > sma200;
  const c5 = price >= low52w * 1.30;
  const c6 = price >= high52w * 0.75;
  const c7 = r >= 50 && r <= 80;
  const c8 = m.hist > 0 && macdHistRising;

  return {
    price, sma50, sma150, sma200, sma200Slope,
    rsi14: r, macdHist: m.hist, macdHistRising,
    high52w, low52w,
    pctFromHigh52w: (price - high52w) / high52w,
    pctAboveLow52w: (price - low52w) / low52w,
    minerviniConditions: [c1, c2, c3, c4, c5, c6, c7, c8],
    relStrength: benchCloses ? relativeStrength(closes, benchCloses, 252) : null,
    frogInPan: frogInPan(closes, 126),
    volumeThrust: volumes ? volumeThrust(volumes, 50) : null,
    baseLength: baseLength(closes, 0.05),
  };
}

/** Compute the early-IPO trend snapshot for stocks with < 540 days of trading. */
export function computeEarlyTrend(
  closes: number[],
  volumes: number[] | undefined,
  ipoAgeDays: number,
): ScreenerEarlyTrend | null {
  if (closes.length < 5) return null;
  const price = closes[closes.length - 1];
  const ipoLow = Math.min(...closes);
  const mom20 = momentum20d(closes) ?? 0;
  const vt = volumes ? volumeThrust(volumes, Math.min(50, Math.max(10, volumes.length - 1))) : null;
  return {
    price,
    ipoLow,
    priceAboveIpoLow: ipoLow > 0 ? price / ipoLow : 0,
    momentum20d: mom20,
    volumeThrust: vt,
    ipoAgeDays,
  };
}

export function evaluateTrend(
  t: ScreenerTrend | null,
  tag: ThemeTag,
  mode: ScreenerMode = "classic",
  earlyTrend?: ScreenerEarlyTrend | null,
): GateResult {
  // Early-IPO branch — used when full Minervini history is not available.
  if (earlyTrend) return evaluateEarlyIpoTrend(earlyTrend);
  return mode === "gem"
    ? evaluateGemTrend(t, tag)
    : evaluateClassicTrend(t, tag);
}

// Classic — original behavior preserved exactly.
function evaluateClassicTrend(t: ScreenerTrend | null, tag: ThemeTag): GateResult {
  if (!t) {
    return {
      passed: false,
      score: 0,
      maxScore: 20,
      checks: [{ ok: false, label: "Insufficient price history (need ≥200 days)", contribution: 0 }],
    };
  }

  const c = t.minerviniConditions;
  const labels = [
    "Price > 150-DMA AND > 200-DMA",
    "150-DMA > 200-DMA",
    "200-DMA slope rising",
    "50-DMA > 150-DMA AND > 200-DMA",
    "Price ≥30% above 52-wk low",
    "Price within 25% of 52-wk high",
    "RSI(14) in 50-80 healthy zone",
    "MACD hist > 0 AND rising",
  ];

  if (tag === "venture") {
    const ventureConds = [t.price > t.sma50, c[2], t.macdHist > 0, t.pctFromHigh52w >= -0.50];
    const ventureLabels = [
      "Price > 50-DMA",
      "200-DMA slope rising",
      "MACD hist > 0",
      "Price within 50% of 52-wk high",
    ];
    const checks: GateCheck[] = ventureConds.map((ok, i) => ({
      ok, label: ventureLabels[i], contribution: ok ? 5 : 0,
    }));
    const score = checks.reduce((s, ch) => s + ch.contribution, 0);
    return { passed: score >= 10, score, maxScore: 20, checks };
  }

  const checks: GateCheck[] = c.map((ok, i) => ({
    ok, label: labels[i], contribution: ok ? 2.5 : 0,
  }));
  const score = checks.reduce((s, ch) => s + ch.contribution, 0);
  const passed = c.filter((x) => x).length >= 6;
  return { passed, score, maxScore: 20, checks };
}

// Gem mode — same max=20 budget. Trades raw Minervini count for a mix of
// trend confirmation (10) + RS (3) + frog-in-pan (2) + vol thrust (2) + base
// length (3). Pass threshold ≥12.
function evaluateGemTrend(t: ScreenerTrend | null, tag: ThemeTag): GateResult {
  if (!t) {
    return {
      passed: false,
      score: 0,
      maxScore: 20,
      checks: [{ ok: false, label: "Insufficient price history — see early-IPO mode if applicable", contribution: 0 }],
    };
  }

  const checks: GateCheck[] = [];

  // Compact trend confirmation (max 10) — partial Minervini.
  const c = t.minerviniConditions;
  const trendCount = c.filter(Boolean).length;
  const trendPts = Math.min(10, trendCount * 1.25);
  checks.push({
    ok: trendCount >= 5,
    label: `Trend template: ${trendCount}/8 Minervini conditions`,
    contribution: trendPts,
    value: `${trendCount}/8`,
  });

  // Relative strength vs SPY (max 3) — Mansfield/O'Neil.
  {
    const rs = t.relStrength;
    let pts = 0;
    let label = "Relative strength vs SPY unavailable";
    let ok = false;
    if (rs != null) {
      if (rs >= 1.30)       { pts = 3; ok = true; label = `RS ${rs.toFixed(2)} (≥1.30 — strong outperformance)`; }
      else if (rs >= 1.10)  { pts = 2; ok = true; label = `RS ${rs.toFixed(2)} (≥1.10 — modest outperformance)`; }
      else if (rs >= 0.95)  { pts = 1; ok = false; label = `RS ${rs.toFixed(2)} (in line with SPY)`; }
      else                  { pts = 0; ok = false; label = `RS ${rs.toFixed(2)} (lagging SPY)`; }
    }
    checks.push({ ok, label, contribution: pts, value: rs?.toFixed(2) ?? "n/a" });
  }

  // Frog-in-pan (max 2) — Da/Gurun/Warachka stealth grind.
  {
    const fip = t.frogInPan;
    let pts = 0;
    let label = "Frog-in-pan signal unavailable";
    let ok = false;
    if (fip != null) {
      if (fip >= 0.15)      { pts = 2; ok = true; label = `Frog-in-pan ${fip.toFixed(2)} (stealth uptrend)`; }
      else if (fip >= 0.05) { pts = 1; ok = false; label = `Frog-in-pan ${fip.toFixed(2)} (mild positive drift)`; }
      else                  { pts = 0; ok = false; label = `Frog-in-pan ${fip.toFixed(2)} (no drift edge)`; }
    }
    checks.push({ ok, label, contribution: pts });
  }

  // Volume thrust (max 2) — O'Neil CANSLIM.
  {
    const vt = t.volumeThrust;
    let pts = 0;
    let label = "Volume thrust unavailable";
    let ok = false;
    if (vt != null) {
      if (vt >= 1.5)        { pts = 2; ok = true; label = `Volume thrust ${vt.toFixed(2)}× (institutional accumulation)`; }
      else if (vt >= 1.1)   { pts = 1; ok = false; label = `Volume thrust ${vt.toFixed(2)}× (mild uptick)`; }
      else                  { pts = 0; ok = false; label = `Volume thrust ${vt.toFixed(2)}× (no edge)`; }
    }
    checks.push({ ok, label, contribution: pts });
  }

  // Base length (max 3) — longer constructive bases get more weight.
  {
    const bl = t.baseLength;
    let pts = 0;
    let label = "Base length unavailable";
    let ok = false;
    if (bl != null) {
      if (bl >= 40)         { pts = 3; ok = true; label = `${bl}d base (tight consolidation — high-quality setup)`; }
      else if (bl >= 20)    { pts = 2; ok = true; label = `${bl}d base (constructive)`; }
      else if (bl >= 8)     { pts = 1; ok = false; label = `${bl}d base (short)`; }
      else                  { pts = 0; ok = false; label = `${bl}d base (just broke out — chase risk)`; }
    }
    checks.push({ ok, label, contribution: pts });
  }

  // Venture tag retains a slightly looser pass — but inside same budget.
  const score = checks.reduce((s, ch) => s + ch.contribution, 0);
  const passThreshold = tag === "venture" ? 10 : 12;
  const passed = score >= passThreshold;
  return { passed, score, maxScore: 20, checks };
}

// Early-IPO branch — used when a stock has < 540 days of trading history.
// We can't run Minervini against a 200-DMA that doesn't exist; instead we
// check the three signals that consistently identify a healthy post-IPO base.
function evaluateEarlyIpoTrend(e: ScreenerEarlyTrend): GateResult {
  const checks: GateCheck[] = [];

  // Holding 30% above IPO low (max 8)
  {
    const r = e.priceAboveIpoLow;
    let pts = 0;
    let ok = false;
    let label = `Price ${r.toFixed(2)}× IPO low`;
    if (r >= 1.50)        { pts = 8; ok = true; label = `Price ${r.toFixed(2)}× IPO low (well off base)`; }
    else if (r >= 1.30)   { pts = 6; ok = true; label = `Price ${r.toFixed(2)}× IPO low (constructive)`; }
    else if (r >= 1.10)   { pts = 3; ok = false; label = `Price ${r.toFixed(2)}× IPO low (early base)`; }
    else                  { pts = 0; ok = false; label = `Price ${r.toFixed(2)}× IPO low (still in IPO base)`; }
    checks.push({ ok, label, contribution: pts });
  }

  // 20-day momentum (max 6)
  {
    const m = e.momentum20d;
    let pts = 0;
    let ok = false;
    let label = `20-day momentum ${(m * 100).toFixed(1)}%`;
    if (m >= 0.10)        { pts = 6; ok = true; label = `20-day momentum +${(m * 100).toFixed(1)}% (strong)`; }
    else if (m >= 0.03)   { pts = 4; ok = true; label = `20-day momentum +${(m * 100).toFixed(1)}% (positive)`; }
    else if (m >= 0)      { pts = 1; ok = false; label = `20-day momentum +${(m * 100).toFixed(1)}% (flat)`; }
    else                  { pts = 0; ok = false; label = `20-day momentum ${(m * 100).toFixed(1)}% (declining)`; }
    checks.push({ ok, label, contribution: pts });
  }

  // Volume thrust (max 6)
  {
    const vt = e.volumeThrust;
    let pts = 0;
    let ok = false;
    let label = "Volume thrust unavailable";
    if (vt != null) {
      if (vt >= 1.5)      { pts = 6; ok = true; label = `Volume thrust ${vt.toFixed(2)}× (institutional accumulation)`; }
      else if (vt >= 1.0) { pts = 3; ok = false; label = `Volume thrust ${vt.toFixed(2)}× (steady)`; }
      else                { pts = 0; ok = false; label = `Volume thrust ${vt.toFixed(2)}× (drying up)`; }
    }
    checks.push({ ok, label, contribution: pts });
  }

  // Disclosure check: explicitly tag this as post-IPO base
  checks.push({
    ok: true,
    label: `Post-IPO base candidate (${Math.round(e.ipoAgeDays)}d since IPO)`,
    contribution: 0,
  });

  const score = checks.reduce((s, ch) => s + ch.contribution, 0);
  const passed = score >= 12;
  return { passed, score, maxScore: 20, checks };
}
