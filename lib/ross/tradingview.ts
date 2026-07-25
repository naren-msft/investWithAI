import type { RossThresholds } from "@/config/ross";
import { ROSS_CANDIDATE_LIMIT, ROSS_SCANNER_REGION, ROSS_PROFILE } from "@/config/ross";
import type { ScreenerProfile } from "@/config/screenerProfile";
import type { RossCandidate } from "./types";

// TradingView public scanner client (keyless, unofficial). Filters Ross's
// pillars server-side and returns normalized candidates. All failure modes
// (network, timeout, shape changes) resolve to an empty array — callers fall
// back to the Yahoo source. Never throws.

const SCANNER_URL = `https://scanner.tradingview.com/${ROSS_SCANNER_REGION}/scan`;
const TIMEOUT_MS = 8000;

// Column order requested from the scanner. Indices below must match this list.
const COLUMNS = [
  "name",                            // 0 — ticker symbol
  "description",                     // 1 — company name
  "close",                           // 2 — price
  "change",                          // 3 — daily % change
  "relative_volume_10d_calc",        // 4 — 10-day RVol (coarse pre-filter / fallback)
  "average_volume_30d_calc",         // 5 — 30-day average volume (for true 30d RVol)
  "volume",                          // 6 — today's volume
  "float_shares_outstanding_current",// 7 — float (may be null)
  "market_cap_basic",                // 8 — market cap
  "premarket_change",                // 9 — pre-market % change
] as const;

interface ScannerRow {
  s: string;           // "EXCHANGE:TICKER"
  d: (number | string | null)[];
}
interface ScannerResponse {
  totalCount?: number;
  data?: ScannerRow[];
}

/** Result of a scanner fetch. `ok=false` means the source errored (→ fall back);
 *  `ok=true` with an empty array is a legitimate "no matches". */
export interface TradingViewResult {
  ok: boolean;
  candidates: RossCandidate[];
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function symbolOf(s: string, nameCol: unknown): string {
  // Prefer the plain ticker from the "name" column; fall back to the part after
  // the exchange prefix in `s` (e.g. "NASDAQ:ABCD" → "ABCD").
  if (typeof nameCol === "string" && nameCol.trim()) return nameCol.trim().toUpperCase();
  const parts = String(s).split(":");
  return (parts[1] ?? parts[0] ?? "").toUpperCase();
}

function exchangeOf(s: string): string | null {
  // `s` is "EXCHANGE:TICKER" (e.g. "NASDAQ:ABCD"). Return the exchange prefix.
  const parts = String(s).split(":");
  return parts.length > 1 && parts[0] ? parts[0].toUpperCase() : null;
}

/**
 * Fetch Ross-style momentum candidates from TradingView. Pillar 1 (RVol) is
 * computed as a TRUE 30-day relative volume (volume ÷ average_volume_30d_calc)
 * to match Ross's spec; the server-side pre-filter uses the coarser 10-day RVol
 * (a conservative lower bound — for a stock spiking today the 10-day average is
 * usually higher than the 30-day, so 10d-RVol ≤ 30d-RVol) at half the threshold
 * so no genuine 30-day qualifier is excluded. Final 30d-RVol ≥ minRvol is
 * enforced downstream (lib/ross/index.ts).
 *
 * Returns { ok:false } on any error (→ caller falls back to Yahoo) and
 * { ok:true, candidates:[] } on a legitimate empty result set.
 */
export async function fetchTradingViewCandidates(
  t: RossThresholds,
  profile: ScreenerProfile = ROSS_PROFILE,
): Promise<TradingViewResult> {
  const filter: { left: string; operation: string; right: unknown }[] = [
    { left: "change", operation: "egreater", right: t.minChangePct },
    { left: "close", operation: "in_range", right: [t.minPrice, t.maxPrice] },
    // Coarse 10-day pre-filter at half the target; true 30d RVol enforced later.
    { left: "relative_volume_10d_calc", operation: "egreater", right: t.minRvol * 0.5 },
  ];
  // Large-cap profile: enforce the market-cap floor server-side (Pillar 5).
  if (profile.pillar5Mode === "marketcap-min" && t.minMarketCap > 0) {
    filter.push({ left: "market_cap_basic", operation: "egreater", right: t.minMarketCap });
  }

  const body = {
    filter,
    options: { lang: "en" },
    markets: [ROSS_SCANNER_REGION],
    symbols: { query: { types: ["stock"] }, tickers: [] },
    columns: COLUMNS,
    sort: { sortBy: "change", sortOrder: "desc" },
    range: [0, ROSS_CANDIDATE_LIMIT],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let json: ScannerResponse | null = null;
  try {
    const res = await fetch(SCANNER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; investWithAI/1.0)",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[ross/tradingview] scanner HTTP ${res.status}`);
      return { ok: false, candidates: [] };
    }
    json = (await res.json()) as ScannerResponse;
  } catch (e: unknown) {
    console.warn(`[ross/tradingview] scanner fetch failed:`, e instanceof Error ? e.message : e);
    return { ok: false, candidates: [] };
  } finally {
    clearTimeout(timer);
  }

  const rows = json?.data;
  if (!Array.isArray(rows)) return { ok: false, candidates: [] };

  const out: RossCandidate[] = [];
  for (const r of rows) {
    const d = r?.d;
    if (!Array.isArray(d)) continue;
    const ticker = symbolOf(r.s, d[0]);
    if (!ticker) continue;
    const name = (typeof d[1] === "string" && d[1].trim()) ? String(d[1]).trim() : ticker;
    const rvol10 = num(d[4]);
    const avg30 = num(d[5]);
    const volume = num(d[6]);
    // True 30-day relative volume; fall back to the 10-day value if avg30 missing.
    const rvol30 = volume != null && avg30 != null && avg30 > 0 ? volume / avg30 : rvol10;
    out.push({
      ticker,
      name,
      exchange: exchangeOf(r.s),
      price: num(d[2]),
      changePct: num(d[3]),
      relativeVolume: rvol30,
      avgVolume: avg30,
      volume,
      floatShares: num(d[7]),
      marketCap: num(d[8]),
      premarketChangePct: num(d[9]),
      postmarketChangePct: null,
      marketState: null,
      source: "tradingview",
    });
  }
  return { ok: true, candidates: out };
}
