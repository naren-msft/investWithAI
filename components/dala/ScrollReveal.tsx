"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// ScrollReveal — wraps any children; toggles `data-revealed` once the element
// crosses into the viewport. Pair with CSS that animates from `data-revealed=false`
// to `data-revealed=true`. We use it to gate the splitTextRotateIn animations
// on sections below the fold so they don't all fire at page load.
//
// Pure IntersectionObserver, no deps. Falls back to immediate reveal in SSR.
export function ScrollReveal({ children, threshold = 0.15, className }: { children: ReactNode; threshold?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") { setRevealed(true); return; }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setRevealed(true); obs.disconnect(); break; }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [threshold]);

  return (
    <div ref={ref} data-revealed={revealed} className={`dala-scroll-reveal ${className ?? ""}`}>
      {children}
    </div>
  );
}
