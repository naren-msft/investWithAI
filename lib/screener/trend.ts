import { sma, smaSeries, rsi, macd } from "@/lib/indicators";
import type { GateCheck, GateResult, ScreenerTrend } from "./types";
import type { ThemeTag } from "@/config/screener-themes";

export function computeTrend(closes: number[]): ScreenerTrend | null {
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
  };
}

export function evaluateTrend(t: ScreenerTrend | null, tag: ThemeTag): GateResult {
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
