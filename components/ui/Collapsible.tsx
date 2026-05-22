"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function Collapsible({
  storageKey,
  defaultOpen = true,
  summary,
  children,
}: {
  storageKey?: string;
  defaultOpen?: boolean;
  summary?: React.ReactNode;       // shown only when collapsed, beneath the toggle
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!storageKey) { setMounted(true); return; }
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "open") setOpen(true);
      else if (v === "closed") setOpen(false);
    } catch {}
    setMounted(true);
  }, [storageKey]);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (storageKey) {
        try { localStorage.setItem(storageKey, next ? "open" : "closed"); } catch {}
      }
      return next;
    });
  }

  if (!mounted) return null;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 hover:bg-surface-3 text-xs px-2 py-1 transition-colors"
        title={open ? "Collapse" : "Expand"}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {open ? "Collapse" : "Expand"}
      </button>
      {open ? children : (summary ?? null)}
    </>
  );
}
