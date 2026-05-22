import { getCloseSeries } from "@/lib/yahoo";
import { sma } from "@/lib/indicators";
import type { Regime } from "@/types";

// 4-mode market regime detection per the spec:
//   Rally       — strong uptrend, multiplier 0.7 (don't chase)
//   Neutral     — normal, multiplier 1.0
//   Pullback    — mild dip, multiplier 1.2 (buy modestly more)
//   Correction  — significant drawdown, multiplier 1.5 (aggressive buy)

export async function detectRegime(): Promise<Regime> {
  const closes = await getCloseSeries("SPY", 12);
  const spy50 = sma(closes, 50);
  const spy200 = sma(closes, 200);
  const spyPrice = closes[closes.length - 1];
  const pct50 = (spyPrice - spy50) / spy50;
  const pct200 = (spyPrice - spy200) / spy200;

  let kind: Regime["kind"];
  let multiplier: number;
  let reasoning: string;

  if (pct200 < -0.10) {
    kind = "correction"; multiplier = 1.5;
    reasoning =
      `SPY ${spyPrice.toFixed(2)} is ${(pct200 * 100).toFixed(1)}% below its 200d SMA (${spy200.toFixed(2)}) — ` +
      `correction territory. Aggressively deploy underweight positions (×1.5).`;
  } else if (pct50 < -0.03 && pct200 > -0.10) {
    kind = "pullback"; multiplier = 1.2;
    reasoning =
      `SPY ${spyPrice.toFixed(2)} is below its 50d SMA (${spy50.toFixed(2)}) but above 200d — healthy pullback. ` +
      `Deploy modestly more into underweights (×1.2).`;
  } else if (pct50 > 0.05 && spy50 > spy200) {
    kind = "rally"; multiplier = 0.7;
    reasoning =
      `SPY ${spyPrice.toFixed(2)} is ${(pct50 * 100).toFixed(1)}% above its 50d SMA — extended rally. ` +
      `Lighten new buys (×0.7) to avoid chasing.`;
  } else {
    kind = "neutral"; multiplier = 1.0;
    reasoning =
      `SPY ${spyPrice.toFixed(2)} vs 50d ${spy50.toFixed(2)} / 200d ${spy200.toFixed(2)} — neutral conditions; ` +
      `deploy at baseline (×1.0).`;
  }

  return {
    kind, multiplier,
    inputs: { spy50, spy200, spyPrice, pct50, pct200 },
    reasoning,
  };
}
