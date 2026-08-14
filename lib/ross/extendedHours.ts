import YahooFinance from "yahoo-finance2";
import type { RossCandidate } from "./types";
import {
  currentMarketSession,
  isSameDayPostCloseResearchWindowEt,
} from "@/lib/marketTime";

// Extended-hours enrichment. Ross's "gap and go" setup wants names that are
// already moving UP in after-hours (post-close) and continuing to bid up in the
// pre-market before the open. Yahoo's `quote` endpoint exposes both, plus the
// current `marketState`, keyless. Best-effort — never throws.

const yahooFinance = new YahooFinance();
(yahooFinance as { suppressNotices?: (n: string[]) => void }).suppressNotices?.(["yahooSurvey", "ripHistorical"]);

export interface ExtendedHoursInfo {
  marketState: string | null;      // PRE | REGULAR | POST | POSTPOST | CLOSED
  premarketChangePct: number | null;
  postmarketChangePct: number | null;
  exchange: string | null;         // normalized TradingView-style prefix
}

// Yahoo exchange codes → TradingView exchange prefixes (best-effort).
const EXCHANGE_MAP: Record<string, string> = {
  NMS: "NASDAQ",
  NGM: "NASDAQ",
  NCM: "NASDAQ",
  NAS: "NASDAQ",
  NYQ: "NYSE",
  NYS: "NYSE",
  PCX: "AMEX",
  ASE: "AMEX",
  AMEX: "AMEX",
  BATS: "BATS",
};

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeExchange(code?: string | null, full?: string | null): string | null {
  if (code && EXCHANGE_MAP[code]) return EXCHANGE_MAP[code];
  const f = (full ?? "").toLowerCase();
  if (f.includes("nasdaq")) return "NASDAQ";
  if (f.includes("new york") || f.includes("nyse")) return "NYSE";
  if (f.includes("amex") || f.includes("american")) return "AMEX";
  return null;
}

interface YahooQuote {
  symbol?: string;
  marketState?: string;
  preMarketChangePercent?: number;
  postMarketChangePercent?: number;
  exchange?: string;
  fullExchangeName?: string;
}

/**
 * Fetch extended-hours + exchange info for a batch of tickers.
 * Returns a map ticker → ExtendedHoursInfo. Missing tickers are omitted.
 */
export async function fetchExtendedHours(tickers: string[]): Promise<Map<string, ExtendedHoursInfo>> {
  const map = new Map<string, ExtendedHoursInfo>();
  const uniq = Array.from(new Set(tickers.map((t) => t.toUpperCase())));
  if (uniq.length === 0) return map;

  try {
    // NOTE: `validateResult` is a MODULE option (3rd arg), NOT a query option
    // (2nd arg). Passing it as the 2nd arg makes yahoo-finance2 reject the call
    // ("should NOT have additional properties"), which silently disabled ALL
    // extended-hours enrichment — the earliest (pre-market gap) signal.
    const res = (await yahooFinance.quote(uniq, {}, { validateResult: false })) as YahooQuote[] | YahooQuote;
    const quotes = Array.isArray(res) ? res : [res];
    for (const q of quotes) {
      const t = (q.symbol ?? "").toUpperCase();
      if (!t) continue;
      map.set(t, {
        marketState: q.marketState ?? null,
        premarketChangePct: num(q.preMarketChangePercent),
        postmarketChangePct: num(q.postMarketChangePercent),
        exchange: normalizeExchange(q.exchange, q.fullExchangeName),
      });
    }
  } catch (e: unknown) {
    console.warn("[ross/extendedHours] quote failed:", e instanceof Error ? e.message : e);
  }
  return map;
}

/**
 * Given a candidate's extended-hours data, decide whether it is rising in the
 * currently-active extended session and by how much. The active session is
 * derived from the US ET market clock (authoritative, DST-aware) rather than a
 * single vendor's `marketState`, so the gate works even when one source omits
 * it. Pre/post-market values themselves are merged upstream from BOTH
 * TradingView and Yahoo (see lib/ross/index.ts step 2b).
 *   - pre-market / regular → pre-market change
 *   - after-hours          → post-market change
 *   - same-day 20:00–24:00 → post-market research continuation
 *   - other closed states  → no live extended reading
 */
export function extendedRisingOf(
  c: RossCandidate,
  at: Date = new Date(),
): {
  rising: boolean;
  pct: number | null;
  session: "premarket" | "afterhours" | null;
} {
  const pre = c.premarketChangePct;
  const post = c.postmarketChangePct;
  const session = currentMarketSession(at);

  let pct: number | null = null;
  let label: "premarket" | "afterhours" | null = null;

  if (session === "pre-market" || session === "regular") {
    // During regular trading, today's pre-market reading is the relevant
    // extended context ("was bid up pre-market"); post-market would be stale.
    pct = pre;
    label = pre != null ? "premarket" : null;
  } else if (session === "after-hours") {
    pct = post;
    label = post != null ? "afterhours" : null;
  } else if (session === "closed" && isSameDayPostCloseResearchWindowEt(at)) {
    pct = post;
    label = post != null ? "afterhours" : null;
  }

  return { rising: pct != null && pct > 0, pct, session: label };
}
