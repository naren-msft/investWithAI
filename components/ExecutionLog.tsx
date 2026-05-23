"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { CheckCircle2, Loader2, Trash2, AlertTriangle } from "lucide-react";

export interface ExecutionLogProps {
  tickers: { ticker: string; price: number; name: string; recShares?: number; recDollars?: number }[];
  currentPhase: number;
  phaseSize: number;
  phaseDeployed: number;
  phaseRemaining: number;
  capital: number;
  totalDeployed: number;
  phaseReady: boolean;
  lockedReason?: string;
  apiPrefix?: string;
}

interface Execution {
  id: string;
  ticker: string;
  shares: number;
  price: number;
  date: string;
  note?: string;
}

export function ExecutionLog(props: ExecutionLogProps) {
  const apiPrefix = props.apiPrefix ?? "/api";
  const router = useRouter();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [ticker, setTicker] = useState(props.tickers[0]?.ticker ?? "");
  const [shares, setShares] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>("");
  const [override, setOverride] = useState<boolean>(false);

  // Prefill shares + price from current recommendation when ticker changes.
  useEffect(() => {
    const t = props.tickers.find((x) => x.ticker === ticker);
    if (!t) return;
    setPrice(t.price.toFixed(2));
    if (t.recShares && t.recShares > 0) setShares(String(t.recShares));
    else setShares("");
  }, [ticker]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${apiPrefix}/executions`);
      const j = await r.json();
      setExecutions(j.executions ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const projectedCost = (Number(shares) || 0) * (Number(price) || 0);
  const willExceed = projectedCost > props.phaseRemaining + 0.01;
  const phaseLocked = !props.phaseReady;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setOkMsg(null); setBusy(true);
    try {
      const r = await fetch(`${apiPrefix}/executions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker,
          shares: Number(shares),
          price: Number(price),
          date,
          note: note || undefined,
          override,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "save failed");
      setOkMsg(`Logged ${j.execution.shares} ${j.execution.ticker} @ $${j.execution.price.toFixed(2)}`);
      setShares(""); setNote(""); setOverride(false);
      await load();
      router.refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true); setErr(null); setOkMsg(null);
    try {
      const r = await fetch(`${apiPrefix}/executions/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "delete failed");
      await load();
      router.refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const summary = useMemo(() => {
    let totalCost = 0;
    for (const e of executions) totalCost += e.shares * e.price;
    return { totalCost };
  }, [executions]);

  return (
    <CollapsibleCard
      storageKey="card:execution-log"
      helpSection="execution-log"
      title="Log your executions"
      subtitle="Record what you actually bought. Holdings, drift, deployment plan, and tranche budget update instantly. Hard cap enforces the current phase's size — uncheck to override."
      right={
        <Badge variant="info">
          {executions.length} execution{executions.length === 1 ? "" : "s"} · ${summary.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} deployed
        </Badge>
      }
    >

      {/* Phase progress bar */}
      <div className="rounded-lg bg-surface-2 border border-line p-3 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Badge variant={phaseLocked ? "warn" : "success"}>
              {phaseLocked ? `Phase ${props.currentPhase} — locked` : `Phase ${props.currentPhase}`}
            </Badge>
            <span className="subtle">phase size</span>
            <span className="font-mono">${props.phaseSize.toLocaleString()}</span>
          </div>
          <div className="font-mono">
            <span className="subtle">in phase: </span>
            <span className="font-semibold">${Math.round(props.phaseDeployed).toLocaleString()}</span>
            <span className="subtle"> / ${props.phaseSize.toLocaleString()}</span>
            <span className="subtle"> · remaining </span>
            <span className={`font-semibold ${props.phaseRemaining > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
              ${Math.round(props.phaseRemaining).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="mt-2"><ProgressBar value={props.phaseDeployed} max={props.phaseSize} tone="brand" /></div>
        {phaseLocked && props.lockedReason && (
          <div className="mt-2 text-[11px] inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            {props.lockedReason}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <Field label="Ticker">
          <select
            className="h-10 w-full bg-surface-2 border border-line rounded-md text-sm px-2"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
          >
            {props.tickers.map((t) => (
              <option key={t.ticker} value={t.ticker}>
                {t.ticker}{t.recShares ? ` · rec ${t.recShares}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Shares">
          <input
            type="number" min={0} step="any" required
            value={shares} onChange={(e) => setShares(e.target.value)}
            className="h-10 w-full bg-surface-2 border border-line rounded-md text-sm px-2 font-mono"
            placeholder="e.g. 50"
          />
        </Field>
        <Field label="Price / share">
          <input
            type="number" min={0} step="any" required
            value={price} onChange={(e) => setPrice(e.target.value)}
            className="h-10 w-full bg-surface-2 border border-line rounded-md text-sm px-2 font-mono"
            placeholder="auto-filled"
          />
        </Field>
        <Field label="Date">
          <input
            type="date" required
            value={date} onChange={(e) => setDate(e.target.value)}
            className="h-10 w-full bg-surface-2 border border-line rounded-md text-sm px-2 font-mono"
          />
        </Field>
        <Field label="Note (optional)">
          <input
            type="text" maxLength={200}
            value={note} onChange={(e) => setNote(e.target.value)}
            className="h-10 w-full bg-surface-2 border border-line rounded-md text-sm px-2"
            placeholder="e.g. P1 deploy"
          />
        </Field>
        <Field label="\u00A0">
          <Button type="submit" disabled={busy || ((willExceed || phaseLocked) && !override)} variant="primary" className="h-10 w-full justify-center">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {busy ? "Saving…" : "Log buy"}
          </Button>
        </Field>
      </form>

      <div className="flex flex-wrap items-center gap-3 text-xs mb-3">
        <div className="subtle">
          This buy: <span className="font-mono">${projectedCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
        {phaseLocked ? (
          <div className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            Phase {props.currentPhase} is locked. Tick override to log a buy anyway.
          </div>
        ) : willExceed ? (
          <div className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            Exceeds phase {props.currentPhase} remaining (${Math.round(props.phaseRemaining).toLocaleString()}). Tick override to proceed.
          </div>
        ) : (
          <div className="subtle">Within phase {props.currentPhase} cap.</div>
        )}
        <label className="inline-flex items-center gap-1.5 ml-auto cursor-pointer">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
          <span className="subtle">Override phase cap</span>
        </label>
      </div>

      {err && <div className="mb-3 text-sm text-red-700 dark:text-red-300">{err}</div>}
      {okMsg && <div className="mb-3 text-sm text-emerald-700 dark:text-emerald-300">{okMsg}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left subtle text-[11px] uppercase tracking-wider">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Ticker</th>
              <th className="py-2 pr-3 text-right">Shares</th>
              <th className="py-2 pr-3 text-right">Price</th>
              <th className="py-2 pr-3 text-right">Cost</th>
              <th className="py-2 pr-3">Note</th>
              <th className="py-2 pl-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-3 text-center subtle">Loading…</td></tr>
            ) : executions.length === 0 ? (
              <tr><td colSpan={7} className="py-3 text-center subtle">No executions logged yet. Use the form above to record your first buy.</td></tr>
            ) : (
              [...executions].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="py-2 pr-3 font-mono">{e.date}</td>
                  <td className="py-2 pr-3 font-medium">{e.ticker}</td>
                  <td className="py-2 pr-3 text-right font-mono">{e.shares}</td>
                  <td className="py-2 pr-3 text-right font-mono">${e.price.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right font-mono">${(e.shares * e.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="py-2 pr-3 subtle truncate max-w-[200px]">{e.note ?? ""}</td>
                  <td className="py-2 pl-3 text-right">
                    <button
                      onClick={() => remove(e.id)}
                      disabled={busy}
                      title="Delete execution"
                      className="text-ink-muted hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="text-[10px] uppercase tracking-wider subtle mb-1 h-3">{label}</div>
      {children}
    </div>
  );
}
