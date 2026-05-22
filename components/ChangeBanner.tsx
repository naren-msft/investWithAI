"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AlertTriangle, Bell, BellOff, History } from "lucide-react";

interface SignalChange { ticker: string; from: string; to: string; }
interface Diff {
  current: { asOf: string; regimeKind: string; regimeMultiplier: number };
  previous: { asOf: string; regimeKind: string };
  regimeChanged: boolean;
  signalChanges: SignalChange[];
  newRecommendations: { ticker: string; dollars: number; signal: string }[];
  droppedRecommendations: { ticker: string }[];
}

const KEY_NOTIFY = "investai.notify.enabled";
const KEY_LASTACK = "investai.changes.lastAck";

export function ChangeBanner({ refreshTick }: { refreshTick?: number }) {
  const [diff, setDiff] = useState<Diff | null>(null);
  const [notifyOn, setNotifyOn] = useState(false);
  const [acked, setAcked] = useState(false);

  useEffect(() => {
    try { setNotifyOn(localStorage.getItem(KEY_NOTIFY) === "true"); } catch {}
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/snapshots?diff=1&limit=2")
      .then((r) => r.json())
      .then((j) => alive && setDiff(j.diff ?? null))
      .catch(() => alive && setDiff(null));
    return () => { alive = false; };
  }, [refreshTick]);

  // When diff appears, optionally fire a desktop notification (once per
  // current.asOf so the same change doesn't notify on every refresh).
  useEffect(() => {
    if (!diff) return;
    if (!notifyOn) return;
    try {
      const ackedFor = localStorage.getItem(KEY_LASTACK);
      if (ackedFor === diff.current.asOf) return;
      const headline = headlineFor(diff);
      if (headline && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("InvestWithAI", { body: headline });
      }
      localStorage.setItem(KEY_LASTACK, diff.current.asOf);
    } catch {}
  }, [diff, notifyOn]);

  if (!diff) return null;
  if (acked) return null;

  const hasChanges = diff.regimeChanged || diff.signalChanges.length > 0 || diff.newRecommendations.length > 0 || diff.droppedRecommendations.length > 0;
  if (!hasChanges) return null;

  async function toggleNotifications() {
    if (!("Notification" in window)) return;
    if (notifyOn) {
      setNotifyOn(false);
      try { localStorage.setItem(KEY_NOTIFY, "false"); } catch {}
      return;
    }
    if (Notification.permission === "default") {
      const p = await Notification.requestPermission();
      if (p !== "granted") return;
    }
    if (Notification.permission === "granted") {
      setNotifyOn(true);
      try { localStorage.setItem(KEY_NOTIFY, "true"); } catch {}
      new Notification("InvestWithAI", { body: "Notifications enabled — you'll see signal & regime changes here." });
    }
  }

  return (
    <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-700 dark:text-amber-300 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">Changes since last snapshot</div>
            <div className="text-[11px] text-amber-800/80 dark:text-amber-200/80 flex items-center gap-1 mt-0.5">
              <History className="w-3 h-3" />
              {new Date(diff.previous.asOf).toLocaleString()} → {new Date(diff.current.asOf).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleNotifications}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 hover:bg-surface-3 text-xs px-2 py-1"
            title={notifyOn ? "Disable desktop notifications" : "Enable desktop notifications"}
          >
            {notifyOn ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            {notifyOn ? "On" : "Off"}
          </button>
          <button
            onClick={() => setAcked(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 hover:bg-surface-3 text-xs px-2 py-1"
            title="Dismiss until next change"
          >
            Dismiss
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-sm">
        {diff.regimeChanged && (
          <div className="flex items-center gap-2">
            <Badge variant="warn">REGIME CHANGE</Badge>
            <span className="text-amber-900 dark:text-amber-100">
              <span className="font-mono uppercase">{diff.previous.regimeKind}</span>
              {" → "}
              <span className="font-mono uppercase font-semibold">{diff.current.regimeKind}</span>
              <span className="subtle"> (multiplier {diff.current.regimeMultiplier})</span>
            </span>
          </div>
        )}

        {diff.signalChanges.length > 0 && (
          <div>
            <div className="text-xs subtle uppercase tracking-wider">Signal flips</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {diff.signalChanges.map((c) => (
                <span key={c.ticker} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs">
                  <span className="font-semibold">{c.ticker}</span>
                  <SigChip label={c.from} />
                  <span className="subtle">→</span>
                  <SigChip label={c.to} />
                </span>
              ))}
            </div>
          </div>
        )}

        {diff.newRecommendations.length > 0 && (
          <div>
            <div className="text-xs subtle uppercase tracking-wider">New buy recommendations</div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {diff.newRecommendations.map((r) => (
                <span key={r.ticker} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5">
                  <span className="font-semibold">{r.ticker}</span>{" "}
                  <span className="font-mono">${Math.round(r.dollars).toLocaleString()}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {diff.droppedRecommendations.length > 0 && (
          <div>
            <div className="text-xs subtle uppercase tracking-wider">No longer recommended</div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {diff.droppedRecommendations.map((r) => (
                <span key={r.ticker} className="rounded-md border border-line bg-surface-3 px-2 py-0.5">
                  <span className="font-semibold">{r.ticker}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function SigChip({ label }: { label: string }) {
  const cls =
    label === "BUY"   ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" :
    label === "AVOID" ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30" :
                        "bg-surface-3 border-line";
  return <span className={`px-1.5 py-0 rounded text-[10px] font-mono border ${cls}`}>{label}</span>;
}

function headlineFor(diff: Diff): string | null {
  const parts: string[] = [];
  if (diff.regimeChanged) parts.push(`Regime: ${diff.previous.regimeKind} → ${diff.current.regimeKind}`);
  if (diff.signalChanges.length) parts.push(`${diff.signalChanges.length} signal flip${diff.signalChanges.length === 1 ? "" : "s"}`);
  if (diff.newRecommendations.length) parts.push(`${diff.newRecommendations.length} new buy${diff.newRecommendations.length === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : null;
}
