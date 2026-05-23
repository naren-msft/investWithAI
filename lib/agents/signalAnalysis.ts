import { getCloseSeries } from "@/lib/yahoo";
import { macd, rsi } from "@/lib/indicators";
import type { AgentResult, ConvictionTier, SignalRow, TargetWeight } from "@/types";

// Tier-aware RSI/MACD thresholds. ETF targets (no `tier` field) default to
// "core" which preserves the original spec (BUY ≤ 35, AVOID ≥ 70).
//
// Speculative names additionally require MACD hist > 0 for a BUY (no neutral
// MACD-only BUYs) — high-volatility small caps can spike RSI without trend.
interface TierThresholds {
  buyMaxRsi: number;
  avoidMinRsi: number;
  requireMacdConfirmForBuy: boolean;
}

const THRESHOLDS: Record<ConvictionTier, TierThresholds> = {
  core:        { buyMaxRsi: 35, avoidMinRsi: 70, requireMacdConfirmForBuy: false },
  growth:      { buyMaxRsi: 30, avoidMinRsi: 75, requireMacdConfirmForBuy: false },
  speculative: { buyMaxRsi: 25, avoidMinRsi: 80, requireMacdConfirmForBuy: true  },
};

// Minimum closes required to compute RSI(14) + MACD(26,9). Anything less
// produces a HOLD with insufficient-data flag.
const MIN_BARS = 35;

export async function signalAnalysisAgent(
  targets: TargetWeight[]
): Promise<AgentResult<SignalRow[]>> {
  const rows = await Promise.all(
    targets.map(async (t): Promise<SignalRow> => {
      const tier: ConvictionTier = t.tier ?? "core";
      const th = THRESHOLDS[tier];
      try {
        const closes = await getCloseSeries(t.ticker, 9);
        if (closes.length < MIN_BARS) {
          return {
            ticker: t.ticker,
            signal: "HOLD",
            rsi: NaN,
            macdHist: NaN,
            reason: `Insufficient history (${closes.length} bars, need ${MIN_BARS}) — HOLD; drift fallback skipped.`,
          };
        }
        const r = rsi(closes, 14);
        const m = macd(closes);
        const mPrev = macd(closes.slice(0, -1));
        const macdRising = !Number.isNaN(m.hist) && !Number.isNaN(mPrev.hist) && m.hist > mPrev.hist;
        const macdBullish = !Number.isNaN(m.hist) && m.hist > 0 && macdRising;

        let signal: SignalRow["signal"];
        let reason: string;
        if (Number.isNaN(r) || Number.isNaN(m.hist)) {
          signal = "HOLD";
          reason = "Insufficient indicator history; default HOLD (drift fallback still applies).";
        } else if (r >= th.avoidMinRsi) {
          signal = "AVOID";
          reason = `RSI ${r.toFixed(1)} ≥ ${th.avoidMinRsi} (${tier}) — overbought, do not buy now.`;
        } else if (r <= th.buyMaxRsi) {
          if (th.requireMacdConfirmForBuy && !macdBullish) {
            signal = "HOLD";
            reason = `RSI ${r.toFixed(1)} ≤ ${th.buyMaxRsi} (${tier}) but speculative tier requires MACD hist > 0 + rising for BUY (got hist ${m.hist.toFixed(3)}).`;
          } else {
            signal = "BUY";
            reason = `RSI ${r.toFixed(1)} ≤ ${th.buyMaxRsi} (${tier}) — oversold buy zone${macdBullish ? " · MACD bullish confirmation" : ""}.`;
          }
        } else if (macdBullish && !th.requireMacdConfirmForBuy) {
          signal = "BUY";
          reason = `RSI ${r.toFixed(1)} neutral but MACD hist ${m.hist.toFixed(3)} rising > 0 (${tier}) — bullish confirmation.`;
        } else {
          signal = "HOLD";
          reason = `RSI ${r.toFixed(1)} / MACD hist ${m.hist.toFixed(3)} (${tier}) — no decisive setup (drift-fallback still applies).`;
        }
        return { ticker: t.ticker, signal, rsi: r, macdHist: m.hist, reason };
      } catch (e: any) {
        return { ticker: t.ticker, signal: "HOLD", rsi: NaN, macdHist: NaN, reason: `Data error: ${e?.message ?? e}` };
      }
    })
  );

  const buys   = rows.filter((r) => r.signal === "BUY"  ).map((r) => r.ticker).join(", ") || "none";
  const avoids = rows.filter((r) => r.signal === "AVOID").map((r) => r.ticker).join(", ") || "none";
  const reasoning = `RSI-14 + MACD(12,26,9) tier-aware scan. BUY: ${buys}. AVOID: ${avoids}.`;

  return { agent: "SignalAnalysisAgent", output: rows, reasoning };
}
