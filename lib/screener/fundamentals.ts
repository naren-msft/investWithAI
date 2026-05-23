import type { GateCheck, GateResult, ScreenerFundamentals } from "./types";
import type { ThemeTag } from "@/config/screener-themes";

interface FundamentalThresholds {
  minRevenueGrowth: number;
  minGrossMargin: number;
  minOperatingMargin: number;
  requireFcfPositive: boolean;
  maxDebtToEquity: number;
  minRoe: number;
}

const TAG_THRESHOLDS: Record<ThemeTag, FundamentalThresholds> = {
  core:      { minRevenueGrowth: 0.15, minGrossMargin: 0.45, minOperatingMargin: 0.10, requireFcfPositive: true,  maxDebtToEquity: 200, minRoe: 0.12 },
  emerging:  { minRevenueGrowth: 0.25, minGrossMargin: 0.35, minOperatingMargin: 0.00, requireFcfPositive: false, maxDebtToEquity: 300, minRoe: 0.00 },
  venture:   { minRevenueGrowth: 0.00, minGrossMargin: 0.00, minOperatingMargin: -1.0, requireFcfPositive: false, maxDebtToEquity: 999, minRoe: -1.0 },
};

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtUsdBn(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

export function evaluateFundamentals(
  f: ScreenerFundamentals,
  tag: ThemeTag,
): GateResult {
  const th = TAG_THRESHOLDS[tag];
  const checks: GateCheck[] = [];

  {
    const v = f.revenueGrowth;
    const ok = v != null && v >= th.minRevenueGrowth;
    checks.push({ ok, label: `Revenue growth ${fmtPct(v)} (≥${fmtPct(th.minRevenueGrowth)})`, contribution: ok ? 10 : 0, value: fmtPct(v) });
  }
  {
    const v = f.grossMargins;
    const ok = v != null && v >= th.minGrossMargin;
    checks.push({ ok, label: `Gross margin ${fmtPct(v)} (≥${fmtPct(th.minGrossMargin)})`, contribution: ok ? 8 : 0, value: fmtPct(v) });
  }
  {
    const v = f.operatingMargins;
    const ok = v != null && v >= th.minOperatingMargin;
    checks.push({ ok, label: `Operating margin ${fmtPct(v)} (≥${fmtPct(th.minOperatingMargin)})`, contribution: ok ? 7 : 0, value: fmtPct(v) });
  }
  {
    const v = f.freeCashflow;
    const ok = th.requireFcfPositive ? (v != null && v > 0) : true;
    const points = v != null && v > 0 ? 7 : (!th.requireFcfPositive ? 3 : 0);
    checks.push({
      ok: th.requireFcfPositive ? (v != null && v > 0) : (v != null && v > 0),
      label: th.requireFcfPositive ? `FCF ${fmtUsdBn(v)} (positive required)` : `FCF ${fmtUsdBn(v)} (relaxed for venture)`,
      contribution: points,
      value: fmtUsdBn(v),
    });
  }
  {
    const v = f.debtToEquity;
    const ok = v == null || v <= th.maxDebtToEquity;
    checks.push({ ok, label: `Debt/Equity ${v?.toFixed(1) ?? "n/a"} (≤${th.maxDebtToEquity})`, contribution: ok ? 5 : 0, value: v?.toFixed(1) ?? "n/a" });
  }
  {
    const v = f.returnOnEquity;
    const ok = v != null && v >= th.minRoe;
    checks.push({ ok, label: `ROE ${fmtPct(v)} (≥${fmtPct(th.minRoe)})`, contribution: ok ? 3 : 0, value: fmtPct(v) });
  }

  const score = checks.reduce((s, c) => s + c.contribution, 0);
  const passed = score >= 25;
  return { passed, score, maxScore: 40, checks };
}
