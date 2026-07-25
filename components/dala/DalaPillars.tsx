import Link from "next/link";
import { PulseIcon, BasketIcon, OrbitIcon } from "./icons";
import { RevealHeading } from "./RevealHeading";
import { ScrollReveal } from "./ScrollReveal";

interface Pillar {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  heading: string;
  body: string;
  cta: string;
}

const PILLARS: Pillar[] = [
  {
    href: "/fomc",
    icon: <PulseIcon width={48} height={48} style={{ color: "#8052ff" }} />,
    eyebrow: "Decision engine",
    heading: "FOMC playbook",
    body: "Three scenarios (CUT / HOLD / HIKE), live regime banner, today's tickets, 5-day SPY candles with MACD + RSI verdict.",
    cta: "Open playbook",
  },
  {
    href: "/etf",
    icon: <BasketIcon width={48} height={48} style={{ color: "#15846e" }} />,
    eyebrow: "Diversified core",
    heading: "ETF sleeves",
    body: "Nine-sleeve allocation with sector caps, bond ballast, international tilt, and overlap warnings against your single-name book.",
    cta: "View sleeves",
  },
  {
    href: "/stocks",
    icon: <OrbitIcon width={48} height={48} style={{ color: "#ffb829" }} />,
    eyebrow: "Signal seeking",
    heading: "Stocks & screener",
    body: "Your own ticker universe with intraday quotes, dividend tracking, tax-lot ledger, and invalidation watch — no demo accounts.",
    cta: "Run screener",
  },
];

export function DalaPillars() {
  return (
    <section className="dala-section">
      <div className="dala-shell">
        <ScrollReveal>
          <p className="dala-eyebrow" style={{ marginBottom: 18, color: "#9a9a9a" }}>
            What's inside
          </p>
          <RevealHeading
            as="h2"
            lines={["Three surfaces.", "One thesis."]}
            className="dala-display"
            style={{ marginBottom: 48, maxWidth: 760 }}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PILLARS.map((p, idx) => (
              <Link
                key={p.href}
                href={p.href}
                className="dala-hairline dala-scroll-fade"
                style={{
                  padding: 28,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  background: "transparent",
                  transitionDelay: `${idx * 120}ms`,
                }}
              >
                <div style={{ marginBottom: 8 }}>{p.icon}</div>
                <p className="dala-eyebrow-violet">{p.eyebrow}</p>
                <h3 className="dala-heading-sm">{p.heading}</h3>
                <p className="dala-body-ash">{p.body}</p>
                <span className="dala-caption" style={{ marginTop: "auto", color: "#ffffff" }}>
                  {p.cta} →
                </span>
              </Link>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
