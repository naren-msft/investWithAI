import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getQuotes } from "@/lib/yahoo";
import { FOMC_WATCHLIST } from "@/config/fomc-watchlist";
import { Eye, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { clsx } from "@/components/ui/cn";

const YAHOO_QUOTE_URL = (t: string) => `https://finance.yahoo.com/quote/${t}`;

// Display-only "AI optical / memory" watchlist. NOT part of the FOMC plan —
// no targets, no caps, no buy gates. Just live quotes + a one-line thesis so
// the user can monitor these names alongside the playbook.
//
// Quotes come from Yahoo on every server-render (page is force-dynamic), so
// data freshness matches the rest of the FOMC dashboard. If a quote returns
// invalid/stale, the row shows the error verbatim — same data-quality
// language as DataHealthBanner uses elsewhere.
export async function WatchlistPanel() {
  let quotes: Awaited<ReturnType<typeof getQuotes>> = [];
  let fetchError: string | null = null;
  try {
    quotes = await getQuotes(FOMC_WATCHLIST.map((w) => w.ticker));
  } catch (e: any) {
    fetchError = e?.message ?? String(e);
  }
  const quoteByTicker = new Map(quotes.map((q) => [q.ticker, q]));

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Eye className="w-4 h-4 text-sky-500" />
            Watchlist · AI optical &amp; memory
          </span>
        }
        subtitle="Read-only quotes for names you're tracking but not trading as part of the FOMC plan. Not included in targets, caps, or buy gates."
        right={
          <Badge variant="info">{FOMC_WATCHLIST.length} tickers</Badge>
        }
      />

      {fetchError && (
        <div className="text-[11px] text-red-700 dark:text-red-300 mb-2">
          Quote fetch failed: {fetchError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide subtle">
            <tr className="border-b border-line">
              <th className="text-left py-2 pr-2">Ticker</th>
              <th className="text-left py-2 px-2">Name</th>
              <th className="text-right py-2 px-2">Last</th>
              <th className="text-right py-2 px-2">Day</th>
              <th className="text-left py-2 px-2">Thesis / Why watching</th>
              <th className="text-right py-2 pl-2">Open</th>
            </tr>
          </thead>
          <tbody>
            {FOMC_WATCHLIST.map((w) => {
              const q = quoteByTicker.get(w.ticker);
              const px = q?.price ?? 0;
              const chgPct = q?.changePct ?? 0;
              const bad = q?.dataQuality === "invalid" || q?.dataQuality === "stale";
              const tone = chgPct > 0.001 ? "up" : chgPct < -0.001 ? "down" : "flat";
              return (
                <tr key={w.ticker} className={clsx("border-b border-line/60", bad && "bg-red-500/5")}>
                  <td className="py-1.5 pr-2 font-mono font-semibold">{w.ticker}</td>
                  <td className="py-1.5 px-2 subtle">{w.name}</td>
                  <td className="py-1.5 px-2 text-right font-mono">
                    {px > 0 ? `$${px.toFixed(2)}` : <span className="subtle">—</span>}
                  </td>
                  <td
                    className={clsx(
                      "py-1.5 px-2 text-right font-mono inline-flex items-center justify-end gap-0.5 w-full",
                      tone === "up" && "text-emerald-600 dark:text-emerald-400",
                      tone === "down" && "text-red-600 dark:text-red-400",
                      tone === "flat" && "subtle",
                    )}
                  >
                    {tone === "up" && <TrendingUp className="w-3 h-3" />}
                    {tone === "down" && <TrendingDown className="w-3 h-3" />}
                    {tone === "flat" && <Minus className="w-3 h-3" />}
                    {q ? `${chgPct >= 0 ? "+" : ""}${(chgPct * 100).toFixed(2)}%` : "—"}
                  </td>
                  <td className="py-1.5 px-2 subtle text-[11px] leading-snug">
                    {bad ? (
                      <span className="text-red-700 dark:text-red-300">
                        {q?.qualityReason ?? "quote unavailable"}
                      </span>
                    ) : (
                      w.thesis
                    )}
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    <a
                      href={YAHOO_QUOTE_URL(w.ticker)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold px-2 py-1 transition-colors"
                      title={`Open ${w.ticker} on Yahoo Finance`}
                    >
                      Yahoo
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] subtle mt-3 leading-relaxed">
        <span className="font-semibold text-ink">Note:</span> Watchlist quotes refresh with the dashboard auto-refresh tick.
        To promote one of these to the active plan, add it to <code className="kbd">FOMC_UNIVERSE</code> in
        <code className="kbd"> config/fomc-scenarios.ts</code> with a target weight and per-name cap.
        Logging executions for watchlist tickers is rejected by the API.
      </p>
    </Card>
  );
}
