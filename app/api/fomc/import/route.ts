import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dataFile, type PortfolioKind } from "@/config/bundle";
import { readExecutions } from "@/lib/store";
import { parseBrokerCsv, dedupeAgainstExisting, type BrokerFormat } from "@/lib/brokerImport";
import { FOMC_UNIVERSE } from "@/config/fomc-scenarios";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

const ALLOWED: Set<string> = new Set(FOMC_UNIVERSE.map((t) => t.ticker));

// POST body: { csv: string, format?: "fidelity"|"schwab"|"robinhood"|"generic", dryRun?: boolean }
// On dryRun=true (default), parses and reports what WOULD be inserted; does
// not modify the executions file. The user reviews then re-POSTs with
// dryRun=false to commit.
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const csv = String(body?.csv ?? "");
  const format = (body?.format ?? "generic") as BrokerFormat;
  const dryRun = body?.dryRun !== false;

  if (!csv || csv.length < 10) {
    return NextResponse.json({ error: "csv body is required" }, { status: 400 });
  }

  const { imported, errors } = parseBrokerCsv(csv, format);

  // Filter to FOMC universe — surface non-universe rows as warnings rather
  // than silently importing tickers the dashboard doesn't model.
  const notInUniverse = imported.filter((e) => !ALLOWED.has(e.ticker));
  const inUniverse    = imported.filter((e) =>  ALLOWED.has(e.ticker));

  const existing = await readExecutions("fomc");
  const { fresh, duplicates } = dedupeAgainstExisting(existing, inUniverse);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      summary: {
        parsedRows: imported.length,
        importableRows: fresh.length,
        duplicateRows: duplicates.length,
        notInUniverseRows: notInUniverse.length,
        errorRows: errors.length,
      },
      preview: fresh.slice(0, 50),
      duplicates: duplicates.slice(0, 50),
      notInUniverse: notInUniverse.slice(0, 50),
      errors: errors.slice(0, 50),
    });
  }

  const final = existing.concat(fresh);
  const tmp = dataFile("fomc" as PortfolioKind, `executions.${process.pid}.${Date.now()}.tmp`);
  const out = dataFile("fomc" as PortfolioKind, "executions.json");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify({ executions: final }, null, 2), "utf8");
  await fs.rename(tmp, out);

  return NextResponse.json({
    dryRun: false,
    inserted: fresh.length,
    duplicates: duplicates.length,
    notInUniverse: notInUniverse.length,
    errors: errors.length,
    importId: randomUUID(),
  });
}
