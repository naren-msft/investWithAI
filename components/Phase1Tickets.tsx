import type { PipelineResult } from "@/types";
import { FOMC_UNIVERSE } from "@/config/fomc-scenarios";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fmtUsd } from "@/lib/format";
import { Zap, ExternalLink } from "lucide-react";
import { FIDELITY_TRADE_URL, ROBINHOOD_TRADE_URL, SCHWAB_TRADE_URL } from "@/config/portfolio";
import { clsx } from "@/components/ui/cn";

// Phase-1 buy ratios — Phase 1 budget = 40% of capital = $280K against $700K
// headline. STRICTLY user-only tickers (matches FOMC_UNIVERSE). Fractions of
// the Phase-1 budget so dollar amounts auto-scale when the user overrides
// `?capital=`. Fractions must sum to exactly 1.0 (verified at module load).
// User requested removal (Jun 11 2026) of FUBO + all ETF/fund tickers
// (IAU/INFQ/SOXL/TQQQ) — the $65K those used in Phase 1 has been
// redistributed pro-rata across the remaining 9 single-stock positions.
const PHASE_1_BUY_RATIOS: { ticker: string; pct: number; note: string }[] = [
  { ticker: "NVDA",  pct: 65_000 / 280_000, note: "Split into 3 lots over 3 days · limit -2% of mid" },
  { ticker: "AVGO",  pct: 45_000 / 280_000, note: "Limit at -1.5% of mid" },
  { ticker: "GOOGL", pct: 45_000 / 280_000, note: "Cheaper PE among Mag-7" },
  { ticker: "TSM",   pct: 33_000 / 280_000, note: "Geopolitical-sensitive; limit -2%" },
  { ticker: "ASML",  pct: 26_000 / 280_000, note: "Cyclical; wait for any down-day" },
  { ticker: "ANET",  pct: 20_000 / 280_000, note: "Small add only" },
  { ticker: "PLTR",  pct: 20_000 / 280_000, note: "Tier-2 growth" },
  { ticker: "RBRK",  pct: 13_000 / 280_000, note: "AI data security starter" },
  { ticker: "CRWV",  pct: 13_000 / 280_000, note: "GPU-cloud starter" },
];

if (process.env.NODE_ENV !== "production") {
  const s = PHASE_1_BUY_RATIOS.reduce((acc, r) => acc + r.pct, 0);
  if (Math.abs(s - 1) > 1e-6) {
    // eslint-disable-next-line no-console
    console.warn(`[Phase1Tickets] buy ratios sum to ${s.toFixed(6)}, expected 1.0`);
  }
}

/**
 * Phase-1 buy-ticket panel. Shows the exact pre-FOMC deployment list with
 * limit-price guidance (% below mid) and broker deep-links. Auto-hides once
 * Phase 1 is filled — i.e. each row's ticker has ≥80% of its dollar target
 * actually deployed (per-ticker coverage, not aggregate dollars, so a single
 * lumpy off-plan trade can't hide the rest of the table).
 */
export function Phase1Tickets({ data }: { data: PipelineResult }) {
  const phase1 = data.phaseGates?.[0];
  if (!phase1) return null;

  const capital = data.capital ?? 700_000;
  const phase1Budget = phase1.size;
  const remainingCash = Math.max(0, capital - phase1Budget);

  // Dollar amount per row scales to the actual Phase-1 budget.
  const rows = PHASE_1_BUY_RATIOS.map((r) => ({ ...r, usd: r.pct * phase1Budget }));
  const totalUsd = rows.reduce((s, r) => s + r.usd, 0);

  // Per-ticker fill check: current market value of each ticker (shares × price)
  // vs target dollars. Panel auto-hides only when *every* row has ≥80% of its
  // target actually held, so a single lumpy off-plan trade can't hide the rest.
  const valueByTicker = new Map(data.drift.map((d) => [d.ticker, d.currentUsd]));
  const rowsWithFill = rows.map((r) => {
    const filledUsd = valueByTicker.get(r.ticker) ?? 0;
    return { ...r, filledUsd, fillPct: r.usd > 0 ? filledUsd / r.usd : 1 };
  });
  const allRowsFilled = rowsWithFill.every((r) => r.fillPct >= 0.80);

  const filled = allRowsFilled;
  const consumedPct = phase1Budget > 0 ? Math.min(1, phase1.consumedInPhase / phase1Budget) : 0;

  // Price-by-ticker lookup for live limit-order suggestions.
  const priceByTicker = new Map(data.drift.map((d) => [d.ticker, d.price]));
  const metaByTicker = new Map(FOMC_UNIVERSE.map((u) => [u.ticker, u]));
  // Per-ticker data quality — used to BLOCK trading on invalid/stale rows.
  const healthByTicker = new Map((data.dataHealth ?? []).map((h) => [h.ticker, h]));

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Phase 1 · Buy this week (pre-FOMC)
          </span>
        }
        subtitle="Neutral half-sized HOLD build. Deploy now → June 16. Live mid-prices drive the suggested limit. Open the broker deep-link to place each order."
        right={
          <Badge variant={filled ? "success" : "info"}>
            {filled ? "filled" : `${fmtUsd(phase1.consumedInPhase)} of ${fmtUsd(phase1Budget)} deployed`}
          </Badge>
        }
      />

      {filled ? (
        <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-900/10 text-sm">
          ✓ Phase 1 complete. Pivot to the active-scenario column for Phase 2 (unlocks 7 days after the first execution).
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mb-3">
            <div
              className="h-full bg-amber-500"
              style={{ width: `${(consumedPct * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide subtle">
                <tr className="border-b border-line">
                  <th className="text-left py-2 pr-2">Ticker</th>
                  <th className="text-right py-2 px-2">$ to buy</th>
                  <th className="text-right py-2 px-2">Mid</th>
                  <th className="text-right py-2 px-2">Limit</th>
                  <th className="text-right py-2 px-2">~Shares</th>
                  <th className="text-right py-2 px-2">Filled</th>
                  <th className="text-left py-2 px-2">Note</th>
                  <th className="text-right py-2 pl-2">Open</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithFill.map((row) => {
                  const lastPx = priceByTicker.get(row.ticker) ?? 0;
                  const meta = metaByTicker.get(row.ticker);
                  const limitPct = meta?.limitPctBelowMid ?? 0;
                  const health = healthByTicker.get(row.ticker);
                  // H6 — prefer (bid+ask)/2 when both are present and sane;
                  // otherwise fall back to last trade price. Mid-price drives
                  // the limit-order suggestion so we're not chasing the offer
                  // on illiquid names with wide spreads.
                  const bid = health?.bid ?? 0;
                  const ask = health?.ask ?? 0;
                  const hasBidAsk = bid > 0 && ask > 0 && ask >= bid;
                  const mid = hasBidAsk ? (bid + ask) / 2 : lastPx;
                  const px = mid;
                  const spreadPct = hasBidAsk && mid > 0 ? (ask - bid) / mid : 0;
                  const wideSpread = spreadPct > 0.01; // > 1% spread — warn
                  const limitPx = px * (1 - limitPct);
                  const shares = limitPx > 0 ? Math.floor(row.usd / limitPx) : 0;
                  const rowFilled = row.fillPct >= 0.80;
                  const blocked = health?.dataQuality === "invalid" || health?.dataQuality === "stale";
                  return (
                    <tr key={row.ticker} className={clsx("border-b border-line/60", blocked && "bg-red-500/5")}>
                      <td className="py-1.5 pr-2 font-mono font-semibold">
                        {row.ticker}
                        {blocked && (
                          <span className="ml-1 text-[9px] font-bold text-red-700 dark:text-red-300 align-top">⚠</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">{fmtUsd(row.usd)}</td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {px > 0 ? `$${px.toFixed(2)}` : <span className="subtle">—</span>}
                        {hasBidAsk && (
                          <span
                            className={clsx("text-[9px] block", wideSpread ? "text-amber-600 dark:text-amber-400 font-semibold" : "subtle")}
                            title={`bid $${bid.toFixed(2)} / ask $${ask.toFixed(2)} · spread ${(spreadPct * 100).toFixed(2)}%`}
                          >
                            {bid.toFixed(2)}/{ask.toFixed(2)} · {(spreadPct * 100).toFixed(2)}%
                            {wideSpread && " ⚠ wide"}
                          </span>
                        )}
                      </td>
                      <td className={clsx("py-1.5 px-2 text-right font-mono", limitPct > 0 ? "text-emerald-500" : "subtle")}>
                        {blocked ? (
                          <span className="text-red-700 dark:text-red-300 font-semibold text-[10px]" title={health?.reason}>
                            DO NOT TRADE
                          </span>
                        ) : limitPx > 0 ? `$${limitPx.toFixed(2)}` : <span className="subtle">market</span>}
                        {!blocked && limitPct > 0 && (
                          <span className="text-[10px] block subtle">
                            {(limitPct * 100).toFixed(1)}% below
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">{!blocked && shares > 0 ? shares : "—"}</td>
                      <td className={clsx("py-1.5 px-2 text-right font-mono text-[11px]", rowFilled ? "text-emerald-500" : "subtle")}>
                        {(row.fillPct * 100).toFixed(0)}%
                      </td>
                      <td className="py-1.5 px-2 subtle">
                        {blocked ? <span className="text-red-700 dark:text-red-300">{health?.reason ?? "data invalid"}</span> : row.note}
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        {blocked ? (
                          <span className="text-[10px] subtle italic">orders disabled</span>
                        ) : (
                          <div className="inline-flex flex-wrap items-center gap-1 justify-end">
                          <a
                            href={FIDELITY_TRADE_URL(row.ticker)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold px-2 py-1 transition-colors"
                            title={`Trade ${row.ticker} on Fidelity`}
                          >
                            Fidelity <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                          <a
                            href={ROBINHOOD_TRADE_URL(row.ticker)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-[#00C805] hover:bg-[#00B305] text-black text-[11px] font-semibold px-2 py-1 transition-colors"
                            title={`Trade ${row.ticker} on Robinhood`}
                          >
                            Robinhood <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                          <a
                            href={SCHWAB_TRADE_URL(row.ticker)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-[#00A0DF] hover:bg-[#0090CF] text-white text-[11px] font-semibold px-2 py-1 transition-colors"
                            title={`Trade ${row.ticker} on Charles Schwab`}
                          >
                            Schwab <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-line font-semibold">
                  <td className="py-2 pr-2">PHASE 1 TOTAL</td>
                  <td className="py-2 px-2 text-right font-mono">
                    {fmtUsd(totalUsd)}
                  </td>
                  <td colSpan={6} className="py-2 px-2 subtle text-[11px]">
                    Remaining {fmtUsd(remainingCash)} stays in cash, pivots to scenario column post-FOMC.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] subtle mt-3 leading-relaxed">
            <span className="font-semibold text-ink">Limit-price logic:</span> mid × (1 − config.limitPctBelowMid).
            Rows marked <span className="text-red-700 dark:text-red-300 font-semibold">DO NOT TRADE</span> are
            blocked because the quote is missing/stale — refresh and try again.
            Adjust limit % in <code className="kbd">config/fomc-scenarios.ts → FOMC_UNIVERSE</code>.
          </p>
        </>
      )}
    </Card>
  );
}
