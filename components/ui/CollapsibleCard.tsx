"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";

export function CollapsibleCard({
  title,
  subtitle,
  helpSection,
  right,
  storageKey,
  defaultCollapsed = false,
  summary,
  className,
  children,
}: {
  title: React.ReactNode;
  subtitle?: string;
  helpSection?: string;
  right?: React.ReactNode;
  /** localStorage key for persisting the collapsed/expanded state across reloads. */
  storageKey?: string;
  /** Initial state before any persisted value is applied. */
  defaultCollapsed?: boolean;
  /** Optional content shown in place of children while collapsed (e.g. a one-line summary). */
  summary?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (storageKey) {
      try {
        const v = localStorage.getItem(storageKey);
        if (v === "open") setCollapsed(false);
        else if (v === "closed") setCollapsed(true);
      } catch {}
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ collapsed: boolean }>).detail;
      if (!detail) return;
      setCollapsed(detail.collapsed);
      if (storageKey) {
        try { localStorage.setItem(storageKey, detail.collapsed ? "closed" : "open"); } catch {}
      }
    }
    window.addEventListener("collapsible-cards:set-all", handler as EventListener);
    return () => window.removeEventListener("collapsible-cards:set-all", handler as EventListener);
  }, [storageKey]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      if (storageKey) {
        try { localStorage.setItem(storageKey, next ? "closed" : "open"); } catch {}
      }
      return next;
    });
  }

  return (
    <Card className={className}>
      <CardHeader
        helpSection={helpSection}
        title={
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            className="inline-flex items-center gap-1.5 text-left hover:opacity-80"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4 shrink-0" />
              : <ChevronDown className="w-4 h-4 shrink-0" />}
            <span>{title}</span>
          </button>
        }
        subtitle={subtitle}
        right={right}
      />
      {!collapsed ? children : (hydrated ? (summary ?? null) : null)}
    </Card>
  );
}
