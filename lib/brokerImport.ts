import type { Execution, ExecutionSide } from "./store";
import { randomUUID } from "node:crypto";

// =============================================================================
// Broker CSV import — Fidelity, Schwab, Robinhood (and a permissive "generic"
// fallback). Each broker exports a slightly different schema; we normalize to
// our Execution shape. Rows are validated and any with bad data are returned
// in `errors[]` so the UI can show "imported X, skipped Y" with details.
// =============================================================================

export type BrokerFormat = "fidelity" | "schwab" | "robinhood" | "generic";

export interface ImportResult {
  imported: Execution[];
  errors: { row: number; reason: string; raw: string }[];
}

function parseCsv(text: string): string[][] {
  // Minimal CSV parser handling quoted fields with commas/escaped quotes.
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { cur.push(field); field = ""; }
      else if (ch === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

function toIsoDate(raw: string): string | null {
  const t = raw.trim();
  // Accept YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY.
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [_, mo, d, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = Date.parse(t);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

function detectSide(action: string): ExecutionSide | null {
  const a = action.toLowerCase();
  if (/(buy|bought|purchase)/.test(a)) return "buy";
  if (/(sell|sold)/.test(a))           return "sell";
  return null;
}

function parseNumber(raw: string): number {
  return Number(String(raw).replace(/[$,()\s]/g, ""));
}

export function parseBrokerCsv(text: string, format: BrokerFormat = "generic"): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { imported: [], errors: [{ row: 0, reason: "no data rows found", raw: text.slice(0, 200) }] };

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const imported: Execution[] = [];
  const errors: ImportResult["errors"] = [];

  // Per-broker column index lookups. We resolve column indices once from the
  // header rather than guessing by position so re-ordered exports still work.
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n || h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const dateCol     = idx("trade date", "run date", "settlement date", "date");
  const actionCol   = idx("action", "transaction", "type", "description");
  const tickerCol   = idx("symbol", "ticker");
  const sharesCol   = idx("quantity", "shares");
  const priceCol    = idx("price ($)", "price", "execution price", "average price");
  const feesCol     = idx("fees & comm", "commission", "fees");
  const extIdCol    = idx("order id", "order #", "reference");

  if (dateCol < 0 || tickerCol < 0 || sharesCol < 0 || priceCol < 0) {
    return {
      imported: [],
      errors: [{
        row: 0,
        reason: `missing required columns (need date/symbol/shares/price). Found: ${header.join(", ")}`,
        raw: rows[0].join(","),
      }],
    };
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => !c.trim())) continue;
    try {
      const date    = toIsoDate(row[dateCol] ?? "");
      const ticker  = (row[tickerCol] ?? "").trim().toUpperCase();
      const shares  = Math.abs(parseNumber(row[sharesCol] ?? ""));
      const price   = parseNumber(row[priceCol] ?? "");
      const fees    = feesCol >= 0 ? Math.abs(parseNumber(row[feesCol] ?? "0")) : 0;
      const side    = actionCol >= 0 ? detectSide(row[actionCol] ?? "") : "buy";
      const extId   = extIdCol >= 0 ? row[extIdCol]?.trim() || undefined : undefined;

      if (!date)                          throw new Error("invalid date");
      if (!ticker)                        throw new Error("missing ticker");
      if (!Number.isFinite(shares) || shares <= 0) throw new Error(`bad shares: ${row[sharesCol]}`);
      if (!Number.isFinite(price)  || price  <= 0) throw new Error(`bad price: ${row[priceCol]}`);
      if (!side)                          throw new Error(`unknown action: ${row[actionCol]}`);

      imported.push({
        id: randomUUID(),
        ticker, shares, price, date, fees, side,
        externalId: extId,
        source: format === "fidelity" ? "import-fidelity"
              : format === "schwab"   ? "import-schwab"
              : format === "robinhood"? "import-robinhood"
              : "import-generic",
        note: `[imported:${format}]`,
      });
    } catch (e: any) {
      errors.push({ row: r + 1, reason: String(e?.message ?? e), raw: row.join(",") });
    }
  }

  return { imported, errors };
}

// Reconciliation: given two execution lists (existing and incoming), drop
// incoming rows that look like duplicates of existing rows. Two executions
// are considered the same if they match on (externalId) when both have it,
// otherwise on (ticker, date, shares, price within 1¢).
export function dedupeAgainstExisting(existing: Execution[], incoming: Execution[]): { fresh: Execution[]; duplicates: Execution[] } {
  const fresh: Execution[] = [];
  const dupes: Execution[] = [];
  for (const inc of incoming) {
    const hit = existing.some((e) => {
      if (inc.externalId && e.externalId && inc.externalId === e.externalId) return true;
      return e.ticker === inc.ticker
          && e.date === inc.date
          && Math.abs(e.shares - inc.shares) < 1e-6
          && Math.abs(e.price - inc.price) < 0.01
          && (e.side ?? "buy") === (inc.side ?? "buy");
    });
    if (hit) dupes.push(inc); else fresh.push(inc);
  }
  return { fresh, duplicates: dupes };
}
