export function sma(values: number[], period: number): number {
  if (values.length < period) return NaN;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function smaSeries(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

// Wilder's RSI
export function rsi(values: number[], period = 14): number {
  if (values.length <= period) return NaN;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function rsiSeries(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number; signal: number; hist: number } {
  if (values.length < slow + signal) return { macd: NaN, signal: NaN, hist: NaN };
  const emaFast = emaSeries(values, fast);
  const emaSlow = emaSeries(values, slow);
  const macdLine = values.map((_, i) => emaFast[i] - emaSlow[i]);
  const validMacd = macdLine.filter((v) => !Number.isNaN(v));
  const signalArr = emaSeries(validMacd, signal);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalArr[signalArr.length - 1];
  return { macd: lastMacd, signal: lastSignal, hist: lastMacd - lastSignal };
}

// Wilder smoothing (RMA): SMA seed for first `period` values then
// exponential update with α = 1/period.
function rmaSeries(values: number[], period: number): number[] {
  if (values.length < period) return new Array(values.length).fill(NaN);
  const out: number[] = new Array(period - 1).fill(NaN);
  let s = 0;
  for (let i = 0; i < period; i++) s += values[i];
  s /= period;
  out.push(s);
  for (let i = period; i < values.length; i++) {
    s = (s * (period - 1) + values[i]) / period;
    out.push(s);
  }
  return out;
}

// Wilder's Average Directional Index — measures trend STRENGTH (not direction).
// Standard thresholds: ADX > 20 = trending, > 25 = strong trend, < 20 = choppy.
export function adx(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number {
  const n = closes.length;
  if (n < period * 2 + 1) return NaN;

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1]),
      ),
    );
  }

  const smoothTR = rmaSeries(tr, period);
  const smoothPDM = rmaSeries(plusDM, period);
  const smoothMDM = rmaSeries(minusDM, period);

  const dx: number[] = [];
  for (let i = 0; i < smoothTR.length; i++) {
    if (!Number.isFinite(smoothTR[i]) || smoothTR[i] === 0) {
      dx.push(NaN);
      continue;
    }
    const pdi = (100 * smoothPDM[i]) / smoothTR[i];
    const mdi = (100 * smoothMDM[i]) / smoothTR[i];
    const denom = pdi + mdi;
    dx.push(denom > 0 ? (100 * Math.abs(pdi - mdi)) / denom : 0);
  }
  const valid = dx.filter((v) => Number.isFinite(v));
  if (valid.length < period) return NaN;
  const adxSeries = rmaSeries(valid, period);
  const last = adxSeries[adxSeries.length - 1];
  return Number.isFinite(last) ? last : NaN;
}

// ---------------------------------------------------------------------------
// MACD-as-series + RSI+MACD verdict helper used by IntradayChart. The scalar
// `macd()` above stays for backward compat; this returns full arrays so the
// chart can plot the MACD/signal/histogram across every bar.
// ---------------------------------------------------------------------------
export interface MacdSeries { macd: number[]; signal: number[]; hist: number[]; }
export function macdSeries(values: number[], fast = 12, slow = 26, signalP = 9): MacdSeries {
  const ef = emaSeriesPublic(values, fast);
  const es = emaSeriesPublic(values, slow);
  const m  = values.map((_, i) => (Number.isNaN(ef[i]) || Number.isNaN(es[i]) ? NaN : ef[i] - es[i]));
  const firstValid = m.findIndex((v) => !Number.isNaN(v));
  const sig: number[] = new Array(values.length).fill(NaN);
  if (firstValid >= 0 && m.length - firstValid >= signalP) {
    const sub = m.slice(firstValid);
    const sEma = emaSeriesPublic(sub, signalP);
    for (let i = 0; i < sEma.length; i++) sig[firstValid + i] = sEma[i];
  }
  const hist = m.map((v, i) => (Number.isNaN(v) || Number.isNaN(sig[i]) ? NaN : v - sig[i]));
  return { macd: m, signal: sig, hist };
}
// Local copy to keep emaSeries private but accessible — same impl.
function emaSeriesPublic(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export type Verdict = "BUY" | "HOLD" | "SELL";
export interface VerdictResult {
  verdict: Verdict;
  score: number;
  reasons: string[];
  rsi: number | null;
  macd: number | null;
  signal: number | null;
  hist: number | null;
  histPrev: number | null;
}

// Combine MACD + RSI into a single Buy/Hold/Sell verdict for the most recent
// bar. Rubric (intentionally simple & explainable):
//   MACD line crosses ABOVE signal this bar      → +2 (fresh bullish trigger)
//   MACD line crosses BELOW signal this bar      → -2 (fresh bearish trigger)
//   MACD > signal AND histogram expanding        → +1
//   MACD < signal AND histogram expanding down   → -1
//   RSI > 70  → -1 (overbought) ·  RSI < 30 → +1 (oversold)
//   RSI 50-70 rising → +1 · RSI 30-50 falling → -1
// Final: score ≥ +2 → BUY · ≤ -2 → SELL · else HOLD.
export function computeVerdict(closes: number[]): VerdictResult {
  const r  = rsiSeries(closes, 14);
  const mz = macdSeries(closes, 12, 26, 9);
  const last = closes.length - 1;
  const prev = closes.length - 2;
  const rVal  = last >= 0 ? r[last]  : NaN;
  const rPrev = prev >= 0 ? r[prev]  : NaN;
  const mVal  = last >= 0 ? mz.macd[last]   : NaN;
  const sVal  = last >= 0 ? mz.signal[last] : NaN;
  const hVal  = last >= 0 ? mz.hist[last]   : NaN;
  const hPrev = prev >= 0 ? mz.hist[prev]   : NaN;
  const mPrev = prev >= 0 ? mz.macd[prev]   : NaN;
  const sPrev = prev >= 0 ? mz.signal[prev] : NaN;

  const reasons: string[] = [];
  let score = 0;

  if (!Number.isNaN(mVal) && !Number.isNaN(sVal)) {
    const above    = mVal > sVal;
    const wasAbove = !Number.isNaN(mPrev) && !Number.isNaN(sPrev) && mPrev > sPrev;
    const crossUp   = above && !wasAbove;
    const crossDown = !above && wasAbove;
    if (crossUp)        { score += 2; reasons.push("MACD just crossed ABOVE signal (bullish trigger)"); }
    else if (crossDown) { score -= 2; reasons.push("MACD just crossed BELOW signal (bearish trigger)"); }
    else if (above) {
      if (!Number.isNaN(hVal) && !Number.isNaN(hPrev) && hVal > hPrev) {
        score += 1; reasons.push("MACD > signal, histogram expanding (bullish momentum)");
      } else {
        reasons.push("MACD > signal but histogram contracting (momentum waning)");
      }
    } else {
      if (!Number.isNaN(hVal) && !Number.isNaN(hPrev) && hVal < hPrev) {
        score -= 1; reasons.push("MACD < signal, histogram expanding down (bearish momentum)");
      } else {
        reasons.push("MACD < signal but histogram contracting (downside fading)");
      }
    }
  }

  if (!Number.isNaN(rVal)) {
    if (rVal >= 70)      { score -= 1; reasons.push(`RSI ${rVal.toFixed(1)} — overbought (>70)`); }
    else if (rVal <= 30) { score += 1; reasons.push(`RSI ${rVal.toFixed(1)} — oversold (<30)`); }
    else if (rVal > 50 && !Number.isNaN(rPrev) && rVal > rPrev) {
      score += 1; reasons.push(`RSI ${rVal.toFixed(1)} — above 50 and rising`);
    } else if (rVal < 50 && !Number.isNaN(rPrev) && rVal < rPrev) {
      score -= 1; reasons.push(`RSI ${rVal.toFixed(1)} — below 50 and falling`);
    } else {
      reasons.push(`RSI ${rVal.toFixed(1)} — neutral`);
    }
  }

  const verdict: Verdict = score >= 2 ? "BUY" : score <= -2 ? "SELL" : "HOLD";
  return {
    verdict, score, reasons,
    rsi:    Number.isNaN(rVal) ? null : rVal,
    macd:   Number.isNaN(mVal) ? null : mVal,
    signal: Number.isNaN(sVal) ? null : sVal,
    hist:   Number.isNaN(hVal) ? null : hVal,
    histPrev: Number.isNaN(hPrev) ? null : hPrev,
  };
}
