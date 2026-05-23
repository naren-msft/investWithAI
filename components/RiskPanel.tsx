"use client";

import type { PipelineResult } from "@/types";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { fmtNum, fmtPct } from "@/lib/format";

// Forward-looking risk panel: portfolio beta (1yr daily regression vs SPY),
// per-ETF worst-rolling-12mo and 2σ parametric annual DD, and concentration
// (HHI / effective N). These are *forward* metrics — they don't depend on
// execution history, only on each ETF's price action over the last 1–3 years.
export function RiskPanel({ data }: { data: PipelineResult }) {
  const r = data.forwardRisk;
  const betaTone = forwardBetaTone(r.portfolioBeta);
  const concTone = concentrationTone(r.concentrationLabel);

  return (
    <CollapsibleCard
      storageKey="card:risk-panel"
      defaultCollapsed
      helpSection="risk-profile"
      title="Risk profile"
      subtitle="Forward-looking risk based on 1–3 years of price history — independent of how much you've deployed."
      right={<Badge variant="info">portfolio β {fmtNum(r.portfolioBeta, 2)}</Badge>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <RiskTile
          label="Target β vs SPY"
          value={fmtNum(r.portfolioBeta, 2)}
          sub={
            r.portfolioBeta < 0.85
              ? "Defensive tilt"
              : r.portfolioBeta < 1.1
                ? "Market-like"
                : r.portfolioBeta < 1.25
                  ? "Modestly aggressive"
                  : "Aggressive — ≈10% SPY drop → ≈" + (r.portfolioBeta * 10).toFixed(0) + "% portfolio drop"
          }
          tone={betaTone}
        />
        <RiskTile
          label="Invested β / Projected"
          value={
            (Number.isFinite(r.investedBeta) ? fmtNum(r.investedBeta, 2) : "—") +
            " → " +
            fmtNum(r.projectedBeta, 2)
          }
          sub={projectedBetaSub(r.projectedBeta, data.sizing.betaThrottle.level)}
          tone={projectedBetaTone(r.projectedBeta)}
        />
        <RiskTile
          label={`Vol gate · VIX ${Number.isFinite(data.sizing.volGate.vix) ? data.sizing.volGate.vix.toFixed(1) : "—"}`}
          value={`${data.sizing.volGate.cap}× cap`}
          sub={`${data.sizing.volGate.level} — ${data.sizing.betaThrottle.multiplier < 1 || data.sizing.volGate.cap < 1.5 ? "throttle active" : "no cap active"}`}
          tone={volGateTone(data.sizing.volGate.level)}
        />
        <RiskTile
          label="HHI · Eff N"
          value={`${fmtNum(r.hhi, 3)} · ${fmtNum(r.effectiveN, 1)}`}
          sub={concPretty(r.concentrationLabel)}
          tone={concTone}
        />
      </div>

      {/* Per-ETF table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left subtle text-[11px] uppercase tracking-wider">
              <th className="py-2 pr-3">Ticker</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3 text-right">Target wt</th>
              <th className="py-2 pr-3 text-right" title="1-year daily log-return regression vs SPY">β vs SPY</th>
              <th className="py-2 pr-3 text-right" title="Worst rolling 252-day return over the last 3 years">Worst 12mo</th>
              <th className="py-2 pr-3 text-right" title="−2σ × √252 — normal-distribution floor; underestimates fat tails">2σ DD</th>
            </tr>
          </thead>
          <tbody>
            {data.drift.map((d) => {
              const beta = r.etfBetas[d.ticker];
              const w12 = r.etfWorstRolling12mo[d.ticker];
              const par = r.etfParametric2Sigma[d.ticker];
              return (
                <tr key={d.ticker} className="border-t border-line">
                  <td className="py-2 pr-3 font-mono font-semibold">{d.ticker}</td>
                  <td className="py-2 pr-3 subtle">{d.role}</td>
                  <td className="py-2 pr-3 text-right font-mono">{fmtPct(d.targetPct, 1)}</td>
                  <td className={`py-2 pr-3 text-right font-mono ${perEtfBetaClass(beta)}`}>{fmtNum(beta, 2)}</td>
                  <td className={`py-2 pr-3 text-right font-mono ${ddClass(w12)}`}>
                    {Number.isFinite(w12) ? fmtPct(w12, 1) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono subtle">
                    {Number.isFinite(par) ? fmtPct(par, 1) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] subtle leading-relaxed">
        β is computed from 252 trading days of daily log-returns vs SPY (cached 1h). Worst 12mo is the
        empirical worst 252-day return over the last ~3 years. Yahoo Finance&apos;s published β uses
        3–5 year monthly data and materially understates daily β for thematic / high-volatility names
        (e.g. SMH, NVDA); these are computed in-house. Bond / short-duration / low-vol holdings may show β ≈ 0.
      </div>
    </CollapsibleCard>
  );
}

function RiskTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "default" | "ready" | "warn" | "muted";
}) {
  const valueClass =
    tone === "ready"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "muted"
          ? "text-ink-muted"
          : "text-ink";
  return (
    <div className="rounded-lg bg-surface-2 border border-line px-3 py-2">
      <div className="subtle text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-semibold text-base font-mono ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] subtle mt-0.5">{sub}</div>}
    </div>
  );
}

function forwardBetaTone(b: number): "default" | "ready" | "warn" | "muted" {
  if (!Number.isFinite(b)) return "muted";
  if (b < 0.85) return "ready";
  if (b < 1.1) return "default";
  if (b < 1.25) return "default";
  return "warn";
}

function concentrationTone(label: string): "default" | "ready" | "warn" | "muted" {
  if (label === "diversified") return "ready";
  if (label === "moderate") return "default";
  if (label === "concentrated") return "default";
  return "warn";
}

function concPretty(label: string): string {
  switch (label) {
    case "diversified": return "Well-diversified";
    case "moderate": return "Moderate concentration";
    case "concentrated": return "Concentrated";
    case "highly-concentrated": return "Highly concentrated";
    default: return label;
  }
}

function perEtfBetaClass(b: number): string {
  if (!Number.isFinite(b)) return "subtle";
  if (b >= 1.4) return "text-amber-700 dark:text-amber-300";
  if (b < 0.5) return "text-emerald-700 dark:text-emerald-300";
  return "";
}

function ddClass(w: number): string {
  if (!Number.isFinite(w)) return "subtle";
  if (w <= -0.40) return "text-red-700 dark:text-red-300";
  if (w <= -0.25) return "text-amber-700 dark:text-amber-300";
  return "";
}

function avgWorst12mo(byTicker: Record<string, number>): number {
  const vals = Object.values(byTicker).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return NaN;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function projectedBetaSub(projected: number, level: "none" | "soft" | "hard"): string {
  if (!Number.isFinite(projected)) return "β unavailable";
  if (level === "hard") return `Hard throttle 0.60× (β > 1.15)`;
  if (level === "soft") return `Soft throttle 0.85× (β ∈ (1.05, 1.15])`;
  return `No throttle (β ≤ 1.05)`;
}

function projectedBetaTone(b: number): "default" | "ready" | "warn" | "muted" {
  if (!Number.isFinite(b)) return "muted";
  if (b <= 1.05) return "ready";
  if (b <= 1.15) return "default";
  return "warn";
}

function volGateTone(level: string): "default" | "ready" | "warn" | "muted" {
  if (level === "calm" || level === "normal") return "ready";
  if (level === "elevated") return "default";
  if (level === "stress" || level === "crisis") return "warn";
  return "muted";
}
