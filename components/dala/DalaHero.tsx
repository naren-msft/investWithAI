import Link from "next/link";
import { DalaParticles } from "./DalaParticles";
import { RevealHeading } from "./RevealHeading";

// Hero — full-bleed editorial composition matching dala.craftedbygc.com.
// Particles render behind the headline; copy is centered-left over the
// vignetted backdrop. Animations are gated to start after the site loader
// finishes (~2.3s), matching Dala's intro timing.
export function DalaHero() {
  return (
    <section className="dala-landing" id="top">
      <div className="dala-landing__particles" aria-hidden="true">
        <DalaParticles />
      </div>

      <div className="dala-shell dala-landing__content">
        <div className="dala-reveal" style={{ marginBottom: 28 }}>
          <div className="reveal-line">
            <span className="reveal-word dala-eyebrow-violet" style={{ ["--i" as string]: 0, ["--base-delay" as string]: "2200ms" }}>
              Invest&nbsp;with&nbsp;AI&nbsp;·&nbsp;Fed&nbsp;decision&nbsp;engine
            </span>
          </div>
        </div>

        <RevealHeading
          as="h1"
          className="dala-hero"
          lines={["Invest", "with", "intent."]}
          baseDelay={2400}
          style={{ margin: 0 }}
        />

        <p className="dala-body-ash" style={{ maxWidth: 560, marginTop: 36 }}>
          InvestWith.AI is the decision layer for active investors.
          Read the Fed, model the playbook, and act before the print.
        </p>

        <div className="dala-landing__cta" style={{ marginTop: 40 }}>
          <Link href="/fomc" className="dala-pill">Launch FOMC Engine</Link>
          <Link href="/stocks" className="dala-pill-ghost">Explore stocks</Link>
        </div>
      </div>
    </section>
  );
}
