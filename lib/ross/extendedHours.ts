import YahooFinance from "yahoo-finance2";
import type { RossCandidate } from "./types";

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
    const res = (await yahooFinance.quote(uniq, { validateResult: false } as never)) as YahooQuote[] | YahooQuote;
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
 * Given a candidate's extended-hours data + current market state, decide whether
 * it is rising in the active extended session and by how much.
 *   - PRE  → pre-market change
 *   - POST / POSTPOST → after-hours change
 *   - REGULAR / CLOSED → use whichever extended value is present (post preferred).
 */
export function extendedRisingOf(c: RossCandidate): {
  rising: boolean;
  pct: number | null;
  session: "premarket" | "afterhours" | null;
} {
  const state = (c.marketState ?? "").toUpperCase();
  const pre = c.premarketChangePct;
  const post = c.postmarketChangePct;

  let pct: number | null = null;
  let session: "premarket" | "afterhours" | null = null;

  if (state === "PRE") {
    pct = pre;
    session = pre != null ? "premarket" : null;
  } else if (state === "POST" || state === "POSTPOST") {
    pct = post;
    session = post != null ? "afterhours" : null;
  } else if (state === "REGULAR") {
    // During regular trading, today's pre-market reading is the relevant extended
    // context ("was bid up pre-market"); post-market would be yesterday's = stale.
    pct = pre;
    session = pre != null ? "premarket" : null;
  } else {
    // CLOSED / unknown — surface the most recent after-hours reading if present.
    if (post != null) {
      pct = post;
      session = "afterhours";
    } else if (pre != null) {
      pct = pre;
      session = "premarket";
    }
  }

  return { rising: pct != null && pct > 0, pct, session };
}
