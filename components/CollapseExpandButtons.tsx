"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

function dispatchAll(collapsed: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("collapsible-cards:set-all", { detail: { collapsed } }));
}

export function CollapseExpandButtons() {
  return (
    <>
      <button
        type="button"
        onClick={() => dispatchAll(true)}
        className="inline-flex items-center gap-1 rounded-md border border-amber-600 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-2.5 py-1 shadow-sm transition-colors"
        title="Collapse all cards"
      >
        <ChevronsDownUp className="w-3.5 h-3.5" />
        Collapse cards
      </button>
      <button
        type="button"
        onClick={() => dispatchAll(false)}
        className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-2.5 py-1 shadow-sm transition-colors"
        title="Expand all cards"
      >
        <ChevronsUpDown className="w-3.5 h-3.5" />
        Expand cards
      </button>
    </>
  );
}
