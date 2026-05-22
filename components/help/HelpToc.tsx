"use client";

import { useEffect, useState } from "react";
import type { HelpSection } from "@/lib/sections";

export function HelpToc({ sections }: { sections: HelpSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <aside className="hidden md:block">
      <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-2">
        <div className="text-[10px] uppercase tracking-wider subtle mb-2">Sections</div>
        <nav className="text-sm space-y-0.5">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`block px-2 py-1.5 rounded transition-colors leading-tight ${
                active === s.id
                  ? "bg-surface-2 font-medium text-ink"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {s.title}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
