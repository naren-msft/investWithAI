import Link from "next/link";

// Small-cap (Ross) vs Large-cap book switcher for the Screener page. Server
// component — the active book is known from the page's `book` search param, so
// no client JS is needed. Switching books drops the threshold query params
// (the two books use different defaults / a different Pillar 5).
export function BookTabs({ book }: { book: "small" | "large" }) {
  const tabs: { key: "small" | "large"; label: string; href: string }[] = [
    { key: "small", label: "Momentum (small-cap)", href: "/screener" },
    { key: "large", label: "Large-cap (S&P 500)", href: "/screener?book=large" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2/40 p-0.5">
      {tabs.map((t) => {
        const active = t.key === book;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
              active
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-ink/70 hover:text-ink hover:bg-surface-3"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
