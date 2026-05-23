"use client";
import { useState } from "react";
import type { BuyRecommendation } from "@/types";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Button, LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FIDELITY_TRADE_URL } from "@/config/portfolio";
import { Copy, ExternalLink } from "lucide-react";

export function FidelityPanel({ recs }: { recs: BuyRecommendation[] }) {
  const [copied, setCopied] = useState(false);
  const tickets = recs
    .filter((r) => r.okToBuy && r.shares > 0)
    .map((r) => `BUY ${r.shares} ${r.ticker} @ MKT  (~$${(r.shares * r.price).toFixed(2)}; RSI ${r.rsi.toFixed(1)})`);

  const text = tickets.join("\n") || "# No qualifying buys right now.";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <CollapsibleCard
      storageKey="card:fidelity-panel"
      helpSection="fidelity-panel"
      title="Fidelity execution"
      subtitle="Copy these tickets, then open Fidelity per ticker to confirm and place orders."
      right={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={copy}>
            <Copy className="w-3.5 h-3.5" /> {copied ? "Copied!" : "Copy tickets"}
          </Button>
        </div>
      }
    >
      <pre className="text-xs font-mono bg-surface-2 border border-line rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
{text}
      </pre>
      <div className="mt-3 flex flex-wrap gap-2">
        {recs.filter((r) => r.okToBuy).map((r) => (
          <LinkButton
            key={r.ticker}
            href={FIDELITY_TRADE_URL(r.ticker)}
            target="_blank"
            rel="noreferrer"
            variant="ghost"
            className="text-xs"
          >
            {r.ticker}
            <ExternalLink className="w-3 h-3" />
          </LinkButton>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Badge variant="warn">Manual execution</Badge>
        <span className="text-[11px] subtle">
          Clicking a ticker opens Fidelity&apos;s trade ticket (you&apos;ll be prompted to sign in). Review before placing the order.
        </span>
      </div>
    </CollapsibleCard>
  );
}
