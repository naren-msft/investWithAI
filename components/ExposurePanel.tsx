import type { DriftRow, PipelineResult } from "@/types";
import { ROLE_TO_SLEEVE, SLEEVE_LABEL, type SleeveGroup } from "@/config/portfolio";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { fmtUsd } from "@/lib/format";
import { sectorMixFromExposures } from "@/lib/risk/sectorMix";
import { HelpLink } from "@/components/ui/HelpLink";

interface SleeveRow {
  sleeve: SleeveGroup;
  label: string;
  tickers: string[];
  currentUsd: number;
  targetUsd: number;
  driftUsd: number;
  currentPct: number;
  targetPct: number;
}

function aggregate(drift: DriftRow[], totalPortfolio: number): SleeveRow[] {
  const by = new Map<SleeveGroup, SleeveRow>();
  for (const d of drift) {
    const sleeve = ROLE_TO_SLEEVE[d.role] ?? "alternatives";
    const cur = by.get(sleeve) ?? {
      sleeve,
      label: SLEEVE_LABEL[sleeve],
      tickers: [],
      currentUsd: 0,
      targetUsd: 0,
      driftUsd: 0,
      currentPct: 0,
      targetPct: 0,
    };
    cur.tickers.push(d.ticker);
    cur.currentUsd += d.currentUsd;
    cur.targetUsd += d.targetUsd;
    cur.driftUsd += d.driftUsd;
    cur.currentPct += d.currentPct;
    cur.targetPct += d.targetPct;
    by.set(sleeve, cur);
  }
  // Order matters for readability: growth → defensive → international → fixed → alt.
  const order: SleeveGroup[] = [
    "equity-growth",
    "equity-defensive",
    "international",
    "fixed-income",
    "alternatives",
  ];
  return order.flatMap((s) => {
    const row = by.get(s);
    return row ? [row] : [];
  });
}

export function ExposurePanel({ data }: { data: PipelineResult }) {
  const sleeves = aggregate(data.drift, data.portfolioValue);
  const totalEquityCurrent = sleeves
    .filter((s) => s.sleeve === "equity-growth" || s.sleeve === "equity-defensive")
    .reduce((acc, s) => acc + s.currentUsd, 0);
  const totalEquityTarget = sleeves
    .filter((s) => s.sleeve === "equity-growth" || s.sleeve === "equity-defensive")
    .reduce((acc, s) => acc + s.targetUsd, 0);

  const cashRemaining = Math.max(0, data.cashUsd - data.cashBuffer);
  const cashRemainingPct = data.capital > 0 ? cashRemaining / data.capital : 0;
  const bufferPct = data.capital > 0 ? data.cashBuffer / data.capital : 0;

  return (
    <Card>
      <CardHeader
        helpSection="exposure"
        title="Exposure"
        subtitle="How exposed am I right now — equity sleeves, international, fixed income, alternatives, and cash."
        right={<Badge variant="info">{sleeves.length} sleeves</Badge>}
      />

      {/* Headline tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <HeadlineTile
          label="Total Equity Exposure"
          value={fmtUsd(totalEquityCurrent)}
          sub={`Target ${fmtUsd(totalEquityTarget)}`}
        />
        <HeadlineTile
          label="Portfolio Value"
          value={fmtUsd(data.portfolioValue)}
          sub={`${(data.deployedUsd / data.capital * 100).toFixed(0)}% deployed`}
        />
        <HeadlineTile
          label="Cash Remaining"
          value={fmtUsd(cashRemaining)}
          sub={`${(cashRemainingPct * 100).toFixed(0)}% of capital`}
          tone={cashRemaining > 0 ? "ready" : "muted"}
        />
        <HeadlineTile
          label="Reserved Buffer"
          value={fmtUsd(data.cashBuffer)}
          sub={`${(bufferPct * 100).toFixed(0)}% — releases on P5`}
          tone="muted"
        />
      </div>

      {/* Sleeve breakdown */}
      <div className="space-y-3">
        {sleeves.map((s) => (
          <SleeveRowView key={s.sleeve} row={s} />
        ))}
      </div>

      {/* Sector mix — the way most investors actually think about exposure */}
      <SectorMixSection sectors={data.sectorExposures} />
    </Card>
  );
}

function SectorMixSection({
  sectors,
}: {
  sectors: { sector: string; effectiveWeight: number }[];
}) {
  if (!sectors || sectors.length === 0) return null;
  const mix = sectorMixFromExposures(sectors);
  const total = mix.tech + mix.defensive + mix.cyclical + mix.other;
  if (total <= 0) return null;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return (
    <div className="mt-5 pt-4 border-t border-line">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
          Sector mix
          <HelpLink section="sector-mix" />
        </h3>
        <span className="text-[11px] subtle">portfolio-weighted (target weights)</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <CategoryTile label="Tech"      value={pct(mix.tech)}      sub="Technology + Communication"   tone="tech" />
        <CategoryTile label="Defensive" value={pct(mix.defensive)} sub="Healthcare + Cons. Def + Util" tone="defensive" />
        <CategoryTile label="Cyclical"  value={pct(mix.cyclical)}  sub="Fin + Cons Cyc + Ind + Energy" tone="cyclical" />
        <CategoryTile label="Other"     value={pct(mix.other)}     sub="Unmapped / fixed income"       tone="muted" />
      </div>
      {mix.topSectors.length > 0 && (
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="text-[11px] uppercase tracking-wider subtle mb-2">Top sectors</div>
          <ul className="space-y-1.5">
            {mix.topSectors.map((s) => (
              <li key={s.sector} className="flex items-center gap-3 text-xs">
                <span className="w-40 truncate">{s.sector}</span>
                <div className="flex-1">
                  <ProgressBar value={s.effectiveWeight} max={Math.max(0.4, mix.topSectors[0].effectiveWeight)} />
                </div>
                <span className="font-mono w-14 text-right">{pct(s.effectiveWeight)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CategoryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "tech" | "defensive" | "cyclical" | "muted";
}) {
  const valueClass =
    tone === "tech"
      ? "text-sky-700 dark:text-sky-300"
      : tone === "defensive"
        ? "text-emerald-700 dark:text-emerald-300"
        : tone === "cyclical"
          ? "text-amber-700 dark:text-amber-300"
          : "text-ink-muted";
  return (
    <div className="rounded-lg bg-surface-2 border border-line px-3 py-2">
      <div className="subtle text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-semibold text-base font-mono ${valueClass}`}>{value}</div>
      <div className="text-[10px] subtle mt-0.5">{sub}</div>
    </div>
  );
}

function HeadlineTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "ready" | "muted";
}) {
  const valueClass =
    tone === "ready"
      ? "text-emerald-700 dark:text-emerald-300"
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

function SleeveRowView({ row }: { row: SleeveRow }) {
  const tickers = row.tickers.join(" · ");
  const fill = row.targetUsd > 0 ? Math.max(0, Math.min(1, row.currentUsd / row.targetUsd)) : 0;
  const driftSign = row.driftUsd > 0 ? "+" : row.driftUsd < 0 ? "−" : "";
  const driftAbs = Math.abs(row.driftUsd);
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
        <div>
          <span className="font-semibold text-ink text-sm">{row.label}</span>
          <span className="subtle ml-2">{tickers}</span>
        </div>
        <div className="font-mono">
          <span className="subtle">current </span>
          <span className="font-semibold">{fmtUsd(row.currentUsd)}</span>
          <span className="subtle"> · target </span>
          <span>{fmtUsd(row.targetUsd)}</span>
          <span className="subtle"> · drift </span>
          <span className={row.driftUsd > 0 ? "text-amber-700 dark:text-amber-300" : row.driftUsd < 0 ? "text-emerald-700 dark:text-emerald-300" : "subtle"}>
            {driftSign}{fmtUsd(driftAbs)}
          </span>
        </div>
      </div>
      <ProgressBar value={row.currentUsd} max={Math.max(row.targetUsd, row.currentUsd, 1)} tone="brand" />
      <div className="flex items-center justify-between text-[10px] subtle mt-1 font-mono">
        <span>{(row.currentPct * 100).toFixed(1)}% of portfolio</span>
        <span>{(fill * 100).toFixed(0)}% of target filled</span>
      </div>
    </div>
  );
}
