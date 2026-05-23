"use client";

import { useEffect, useState } from "react";

/**
 * Renders the SPY benchmark curve as a faded, full-width SVG backdrop.
 * Positioned absolutely; parent must be `relative`.
 */
export function SpyBackdrop() {
  const [values, setValues] = useState<number[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/equity-curve")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const pts = Array.isArray(d?.points) ? d.points : [];
        const spy = pts
          .map((p: { spyBenchmark?: number }) => p?.spyBenchmark)
          .filter((x: unknown): x is number => typeof x === "number" && Number.isFinite(x));
        if (spy.length >= 2) setValues(spy);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  if (!values) return null;

  const W = 1200, H = 220;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = W / (values.length - 1);
  const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`).join(" ");
  const area = `0,${H} ${pts} ${W},${H}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full opacity-25 dark:opacity-30 pointer-events-none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="spyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#spyGrad)" />
      <polyline points={pts} fill="none" stroke="#10b981" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
