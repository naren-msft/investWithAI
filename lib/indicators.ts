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
