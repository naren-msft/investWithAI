import type { PipelineResult } from "@/types";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

/**
 * Data-Health banner — surfaces per-ticker quote validity so the user knows
 * before placing a real-money order which tickers have stale, missing, or
 * illiquid quotes. Hides itself when everything is OK.
 */
export function DataHealthBanner({ data }: { data: PipelineResult }) {
  if (!data.dataHealth || data.dataHealth.length === 0) return null;
  const invalid  = data.dataHealth.filter((h) => h.dataQuality === "invalid");
  const stale    = data.dataHealth.filter((h) => h.dataQuality === "stale");
  const illiquid = data.dataHealth.filter((h) => h.dataQuality === "illiquid");
  const total    = data.dataHealth.length;
  const okCount  = total - invalid.length - stale.length - illiquid.length;
  const anyBad   = invalid.length + stale.length > 0;
  const oldest = data.marketDataAsOf
    ? new Date(data.marketDataAsOf)
    : null;
  const ageMin = oldest ? Math.max(0, Math.round((Date.now() - oldest.getTime()) / 60_000)) : null;

  if (!anyBad && illiquid.length === 0) {
    return (
      <div className="card flex items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4" />
          <span className="font-semibold">Market data healthy</span>
          <span className="subtle">· {okCount}/{total} tickers · oldest quote {ageMin}m ago</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`card border ${invalid.length > 0 ? "border-red-500/40 bg-red-500/5" : stale.length > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-line"}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className={`w-4 h-4 mt-0.5 ${invalid.length > 0 ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink">
            Market data health
            <span className="ml-2 text-[11px] font-normal subtle">
              ({okCount}/{total} OK · oldest quote {ageMin}m ago)
            </span>
          </h3>
          {invalid.length > 0 && (
            <Section
              tone="invalid"
              title="🚫 DO NOT TRADE"
              subtitle="No valid price — pipeline has BLOCKED buys on these tickers."
              items={invalid}
            />
          )}
          {stale.length > 0 && (
            <Section
              tone="stale"
              title="⏰ Stale quotes"
              subtitle="Last trade older than the freshness window — verify in your broker before placing limit orders."
              items={stale}
            />
          )}
          {illiquid.length > 0 && (
            <Section
              tone="illiquid"
              title="📉 Thin liquidity"
              subtitle="Wide spread or low volume — use limit orders only, never market orders."
              items={illiquid}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  tone, title, subtitle, items,
}: {
  tone: "invalid" | "stale" | "illiquid";
  title: string;
  subtitle: string;
  items: PipelineResult["dataHealth"];
}) {
  const color =
    tone === "invalid" ? "text-red-700 dark:text-red-300"
    : tone === "stale" ? "text-amber-700 dark:text-amber-300"
    : "text-sky-700 dark:text-sky-300";
  return (
    <div className="mt-3">
      <div className={`text-xs font-semibold ${color}`}>{title}</div>
      <div className="text-[11px] subtle mt-0.5">{subtitle}</div>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((h) => (
          <li key={h.ticker} className={`text-[11px] font-mono px-2 py-1 rounded border ${tone === "invalid" ? "border-red-500/40 bg-red-500/10" : tone === "stale" ? "border-amber-500/40 bg-amber-500/10" : "border-sky-500/40 bg-sky-500/10"}`}
              title={h.reason}>
            <span className="font-semibold">{h.ticker}</span>
            <span className="ml-1 opacity-70">· {h.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
