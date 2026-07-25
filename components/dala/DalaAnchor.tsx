import { CrystalIcon } from "./icons";
import { RevealHeading } from "./RevealHeading";
import { ScrollReveal } from "./ScrollReveal";

export function DalaAnchor() {
  return (
    <section className="dala-section">
      <div className="dala-shell" style={{ textAlign: "center", maxWidth: 720 }}>
        <ScrollReveal>
          <div className="flex justify-center dala-scroll-fade" style={{ marginBottom: 28 }}>
            <CrystalIcon width={110} height={110} style={{ color: "#15846e" }} />
          </div>
          <p className="dala-eyebrow-violet dala-scroll-fade" style={{ marginBottom: 18, transitionDelay: "120ms" }}>
            Built for real money.
          </p>
          <RevealHeading
            as="h2"
            lines={["No demos.", "No fake fills."]}
            className="dala-display"
            style={{ marginBottom: 22 }}
          />
          <p className="dala-body-ash dala-scroll-fade" style={{ margin: "0 auto", maxWidth: 540, transitionDelay: "240ms" }}>
            Every quote is live, every ledger entry is checked against your sleeve caps, and every signal carries
            a transparent rubric. The system tells you what it sees — and shows you why.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
