import { ScrollReveal } from "./ScrollReveal";
import { RevealHeading } from "./RevealHeading";

// DalaManifesto — three full-height editorial sections that build a point of
// view, mirroring Dala's homepage rhythm (intro essay → product → CTA).
// Each section uses RevealHeading for the display line and a single supporting
// paragraph. Sections enter on scroll via ScrollReveal.
const SLABS: { eyebrow: string; lines: string[]; body: string; accent?: string }[] = [
  {
    eyebrow: "01 · The problem",
    lines: ["Noise compounds", "faster than capital."],
    body:
      "Tickers, chats, alerts, takes. Most of what arrives in your day is texture, " +
      "not signal. Acting on every blip is the surest way to underperform the index " +
      "you set out to beat.",
  },
  {
    eyebrow: "02 · The principle",
    lines: ["Signals should", "explain themselves."],
    body:
      "Every position InvestWith.AI suggests carries the reasoning behind it — the " +
      "macro setup, the rotation it expresses, the catalyst window, the risk if it " +
      "fails. No black boxes. No vibes.",
    accent: "#8052ff",
  },
  {
    eyebrow: "03 · The product",
    lines: ["A decision system", "for active investors."],
    body:
      "Model the Fed&apos;s next move. Pressure-test your tickers against CUT, HOLD, " +
      "and HIKE scenarios. Watch the playbook update as the data prints. " +
      "InvestWith.AI is the workspace that turns research into action.",
  },
];

export function DalaManifesto() {
  return (
    <>
      {SLABS.map((slab, i) => (
        <section key={i} className="dala-section dala-section--tall">
          <ScrollReveal>
            <div className="dala-shell">
              <div
                className="dala-eyebrow dala-scroll-fade"
                style={{ marginBottom: 28, color: slab.accent ?? "#9a9a9a" }}
              >
                {slab.eyebrow}
              </div>
              <RevealHeading
                as="h2"
                className="dala-display"
                lines={slab.lines}
                style={slab.accent ? { color: slab.accent } : undefined}
              />
              <p
                className="dala-body-ash dala-scroll-fade"
                style={{ maxWidth: 720, marginTop: 36 }}
                dangerouslySetInnerHTML={{ __html: slab.body }}
              />
            </div>
          </ScrollReveal>
        </section>
      ))}
    </>
  );
}
