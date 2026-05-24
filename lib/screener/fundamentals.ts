import type { GateCheck, GateResult, ScreenerFundamentals, ScreenerMode } from "./types";
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
  mode: ScreenerMode = "classic",
): GateResult {
  return mode === "gem"
    ? evaluateFundamentalsGem(f, tag)
    : evaluateFundamentalsClassic(f, tag);
}

// Classic — unchanged behavior. Max score 40, pass ≥25.
function evaluateFundamentalsClassic(
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

// Gem mode — same max=40 budget. Rebalanced to make room for PEG (+5), EPS
// revisions (+4), and Piotroski proxy (+6) by trimming the classic budget by 15.
// Pass threshold remains ≥25.
function evaluateFundamentalsGem(
  f: ScreenerFundamentals,
  tag: ThemeTag,
): GateResult {
  const th = TAG_THRESHOLDS[tag];
  const checks: GateCheck[] = [];

  // Trimmed classic checks (10+8+7+7+5+3 = 40 → trimmed to 8+6+5+4+2+0 = 25)
  // Plus PEG (5) + EPS revision (4) + Piotroski (6) = 15. Total max 40.
  {
    const v = f.revenueGrowth;
    const ok = v != null && v >= th.minRevenueGrowth;
    checks.push({ ok, label: `Revenue growth ${fmtPct(v)} (≥${fmtPct(th.minRevenueGrowth)})`, contribution: ok ? 8 : 0, value: fmtPct(v) });
  }
  {
    const v = f.grossMargins;
    const ok = v != null && v >= th.minGrossMargin;
    checks.push({ ok, label: `Gross margin ${fmtPct(v)} (≥${fmtPct(th.minGrossMargin)})`, contribution: ok ? 6 : 0, value: fmtPct(v) });
  }
  {
    const v = f.operatingMargins;
    const ok = v != null && v >= th.minOperatingMargin;
    checks.push({ ok, label: `Operating margin ${fmtPct(v)} (≥${fmtPct(th.minOperatingMargin)})`, contribution: ok ? 5 : 0, value: fmtPct(v) });
  }
  {
    const v = f.freeCashflow;
    const fcfPositive = v != null && v > 0;
    // Gem mode is more permissive on FCF for emerging/venture — pre-FCF compounders
    // (early NVDA, early SHOP) should not be hard-gated. Soft scoring only.
    const points = fcfPositive ? 4 : (tag === "core" ? 0 : 2);
    checks.push({
      ok: fcfPositive,
      label: fcfPositive
        ? `FCF ${fmtUsdBn(v)} (positive)`
        : `FCF ${fmtUsdBn(v)} (gem mode: soft check)`,
      contribution: points,
      value: fmtUsdBn(v),
    });
  }
  {
    const v = f.debtToEquity;
    const ok = v == null || v <= th.maxDebtToEquity;
    checks.push({ ok, label: `Debt/Equity ${v?.toFixed(1) ?? "n/a"} (≤${th.maxDebtToEquity})`, contribution: ok ? 2 : 0, value: v?.toFixed(1) ?? "n/a" });
  }

  // PEG ratio — Lynch GARP. Lower is better; only meaningful for growth names.
  {
    const peg = f.pegRatio;
    const rg = f.revenueGrowth;
    let pts = 0;
    let label = "PEG ratio unavailable";
    if (peg != null && Number.isFinite(peg) && peg > 0 && rg != null && rg >= 0.10) {
      if (peg <= 0.75)      { pts = 5; label = `PEG ${peg.toFixed(2)} (≤0.75 — deeply undervalued growth)`; }
      else if (peg <= 1.5)  { pts = 3; label = `PEG ${peg.toFixed(2)} (≤1.5 — fair-to-undervalued)`; }
      else if (peg <= 2.5)  { pts = 1; label = `PEG ${peg.toFixed(2)} (≤2.5 — fair value)`; }
      else                  { pts = 0; label = `PEG ${peg.toFixed(2)} (>2.5 — premium)`; }
    } else if (peg != null && Number.isFinite(peg) && peg > 0) {
      label = `PEG ${peg.toFixed(2)} (growth too low for GARP)`;
    }
    checks.push({ ok: pts > 0, label, contribution: pts, value: peg?.toFixed(2) ?? "n/a" });
  }

  // EPS revision momentum — Bernard & Thomas 1989 PEAD anomaly.
  {
    const rev = f.epsRevisionDir;
    let pts = 0;
    let label = "EPS revisions unavailable";
    if (rev != null && Number.isFinite(rev)) {
      if (rev > 0)       { pts = 4; label = `EPS estimate trending up over last 30d`; }
      else if (rev === 0){ pts = 1; label = `EPS estimate flat over last 30d`; }
      else               { pts = 0; label = `EPS estimate trending down over last 30d`; }
    }
    checks.push({ ok: pts >= 4, label, contribution: pts });
  }

  // Piotroski 5-point proxy (operating CF positive, ROE positive, rev growth positive,
  // gross margin improving, debt decreasing). Each = 1.2 pts → max 6.
  {
    const p = f.piotroskiProxy;
    let pts = 0;
    let label = "Piotroski proxy unavailable";
    if (p != null && Number.isFinite(p)) {
      pts = Math.round(p * 1.2 * 10) / 10;
      label = `Piotroski proxy ${p}/5 (fundamental quality)`;
    }
    checks.push({ ok: pts >= 4, label, contribution: pts });
  }

  const score = checks.reduce((s, c) => s + c.contribution, 0);
  const passed = score >= 25;
  return { passed, score, maxScore: 40, checks };
}
