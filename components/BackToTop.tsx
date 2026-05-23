"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Floating "back to top" button. Appears after the user scrolls past
 * `showAfterPx` pixels. Smooth-scrolls to top on click.
 */
export function BackToTop({ showAfterPx = 400 }: { showAfterPx?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > showAfterPx);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showAfterPx]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      title="Back to top"
      className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-1.5 rounded-full bg-sky-600 hover:bg-sky-700 text-white shadow-lg px-4 py-2 text-sm font-medium transition-colors dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-black"
    >
      <ArrowUp className="w-4 h-4" />
      <span className="hidden sm:inline">Top</span>
    </button>
  );
}
