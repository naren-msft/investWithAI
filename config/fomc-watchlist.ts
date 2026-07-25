// FOMC watchlist — read-only quotes for tickers the user is tracking but not
// trading as part of the FOMC plan. These are NOT included in:
//   • FOMC_UNIVERSE (no target weights, no sleeve membership)
//   • Phase-1 ticket panel (no buy ratios)
//   • execution gates (POST /api/fomc/executions rejects these tickers)
// They appear only as a display-only "what to watch" card driven by Yahoo
// quotes, with manual notes describing why each is on the watchlist.
export interface FomcWatchItem {
  ticker: string;
  name: string;
  thesis: string;
}

export const FOMC_WATCHLIST: ReadonlyArray<FomcWatchItem> = [
  { ticker: "MU",   name: "Micron Technology",          thesis: "HBM3e/HBM4 supplier to NVDA — direct AI memory read-through." },
  { ticker: "AAOI", name: "Applied Optoelectronics",    thesis: "800G/1.6T optical transceivers — datacenter AI buildout proxy." },
  { ticker: "COHR", name: "Coherent Corp.",             thesis: "Optical components for AI networking; NVDA + hyperscaler exposure." },
  { ticker: "LITE", name: "Lumentum Holdings",          thesis: "Datacom lasers for AI optical interconnects (800G ramp)." },
  { ticker: "TSEM", name: "Tower Semiconductor",        thesis: "Specialty foundry for analog/RF; INTC acquisition fell through — re-rate watch." },
  { ticker: "CIEN", name: "Ciena Corporation",          thesis: "Optical networking equipment — long-haul + DCI for AI clusters." },
];
