import { ScrollReveal } from "./ScrollReveal";
import { RevealHeading } from "./RevealHeading";

// Editorial intro section — single oversized headline followed by a short
// supporting paragraph. Mirrors Dala's "Make decisions with confidence"
// rhythm: enter on scroll, leave space around the text, no card chrome.
export function DalaIntro() {
  return (
    <section className="dala-section dala-section--tall">
      <ScrollReveal>
        <div className="dala-shell">
        <div className="dala-eyebrow-violet dala-scroll-fade" style={{ marginBottom: 24 }}>
          The decision layer
        </div>
        <RevealHeading
          as="h2"
          className="dala-display"
          lines={[
            "Make allocation",
            "decisions with",
            "confidence.",
          ]}
        />
        <p className="dala-body-ash dala-scroll-fade" style={{ maxWidth: 720, marginTop: 40 }}>
          Markets give you a million signals a day. InvestWith.AI keeps the few
          that matter — the Fed&apos;s next move, the rotation underneath the print,
          the names doing the heavy lifting in your portfolio — and explains why
          before it asks you to act.
        </p>
        </div>
      </ScrollReveal>
    </section>
  );
}
