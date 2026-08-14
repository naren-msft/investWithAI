import { ROSS_US_EXCHANGES, type RossThresholds, type WatchThresholds } from "@/config/ross";
import type { ScreenerProfile } from "@/config/screenerProfile";
import {
  isSameDayPostCloseResearchWindowEt,
  type MarketSession,
} from "@/lib/marketTime";
import type { RossCandidate } from "./types";

function usePostmarketBasis(session: MarketSession, at: Date): boolean {
  return session === "after-hours" || (session === "closed" && isSameDayPostCloseResearchWindowEt(at));
}

function activeExtendedPct(
  c: RossCandidate,
  session: MarketSession,
  at: Date = new Date(),
): number | null {
  if (session === "pre-market" || session === "regular") return c.premarketChangePct;
  if (usePostmarketBasis(session, at)) return c.postmarketChangePct;
  return null;
}

/** Current change-vs-close basis for the active session. During pre/after-hours
 *  prefer the live extended-session move when available; otherwise fall back to
 *  the regular-session change. The same-day post-close research window keeps
 *  using post-market data even though the broader market session is "closed". */
export function effectiveChangePct(
  c: RossCandidate,
  session: MarketSession,
  at: Date = new Date(),
): number | null {
  if (session === "pre-market" && c.premarketChangePct != null) {
    return c.premarketChangePct;
  }
  if (usePostmarketBasis(session, at) && c.postmarketChangePct != null) {
    return c.postmarketChangePct;
  }
  return c.changePct;
}

export function effectivePrice(
  c: RossCandidate,
  session: MarketSession,
  at: Date = new Date(),
): number | null {
  const price = c.price;
  if (price == null) return null;
  if (session === "pre-market" && c.premarketChangePct != null) {
    return price * (1 + c.premarketChangePct / 100);
  }
  if (usePostmarketBasis(session, at) && c.postmarketChangePct != null) {
    return price * (1 + c.postmarketChangePct / 100);
  }
  return price;
}

/** Session-aware RVol basis shared by qualification, display, sorting, and
 *  history. Premarket prefers TradingView's live 5-minute RVOL when available;
 *  regular hours preserve the existing max(full-day, time-adjusted intraday)
 *  behavior; after-hours/post-close preserve the full-day basis. */
export function effectiveRvol(
  c: RossCandidate,
  session: MarketSession,
  at: Date = new Date(),
): number | null {
  const fullDay = c.relativeVolume ?? null;
  const vendor5m = c.rvolIntraday5m ?? null;
  const intraday = c.intradayRvol ?? null;
  if (session === "pre-market") {
    return vendor5m != null && vendor5m > 0 ? vendor5m : fullDay;
  }
  if (session === "regular") {
    if (fullDay == null) return intraday;
    if (intraday == null) return fullDay;
    return Math.max(fullDay, intraday);
  }
  if (usePostmarketBasis(session, at)) {
    return fullDay ?? (vendor5m != null && vendor5m > 0 ? vendor5m : intraday);
  }
  return fullDay ?? intraday;
}

export function passesUniverse(
  c: RossCandidate,
  t: RossThresholds,
  profile: ScreenerProfile,
  session: MarketSession,
  at: Date = new Date(),
): boolean {
  if (c.exchange != null && !ROSS_US_EXCHANGES.has(c.exchange.toUpperCase())) return false;
  const price = effectivePrice(c, session, at);
  if (price == null || price < t.minPrice || price > t.maxPrice) return false;
  if (profile.pillar5Mode === "marketcap-min" && t.minMarketCap > 0) {
    if (c.marketCap == null || c.marketCap < t.minMarketCap) return false;
  }
  return true;
}

export function meetsAutomatedPillars(
  c: RossCandidate,
  t: RossThresholds,
  profile: ScreenerProfile,
  session: MarketSession,
  at: Date = new Date(),
): boolean {
  if (!passesUniverse(c, t, profile, session, at)) return false;
  const change = effectiveChangePct(c, session, at);
  if (change == null || change < t.minChangePct) return false;
  const rvol = effectiveRvol(c, session, at);
  if (rvol == null || rvol < t.minRvol) return false;
  if (profile.pillar5Mode === "float-max" && c.floatShares != null && c.floatShares >= t.maxFloat) {
    return false;
  }
  return true;
}

export function classifyStage(
  c: RossCandidate,
  t: RossThresholds,
  watch: WatchThresholds,
  profile: ScreenerProfile,
  session: MarketSession,
  at: Date = new Date(),
): "qualified" | "watch" | null {
  if (!passesUniverse(c, t, profile, session, at)) return null;
  if (meetsAutomatedPillars(c, t, profile, session, at)) return "qualified";

  const change = effectiveChangePct(c, session, at);
  const rvol = effectiveRvol(c, session, at);
  const meetsFloors =
    change != null && change >= watch.watchChangePct && rvol != null && rvol >= watch.watchRvol;
  const gap = activeExtendedPct(c, session, at);
  const gapping = gap != null && gap >= watch.gapPct;
  return meetsFloors || gapping ? "watch" : null;
}
