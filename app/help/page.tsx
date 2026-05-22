import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SECTIONS } from "@/lib/sections";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { HelpToc } from "@/components/help/HelpToc";

export const metadata = {
  title: "Help · InvestWithAI",
  description: "Every section of the dashboard explained.",
};

export default function HelpPage() {
  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm subtle hover:text-ink mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
      </Link>

      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">InvestWithAI — How it works</h1>
        <p className="text-sm subtle mt-2">
          Every section of the dashboard explained: what it is, why it matters, how to read it, and common questions.
          Click any section title from the sidebar to jump to it. Click the small help icon next to any card header
          on the dashboard to land directly on that section.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        <HelpToc sections={SECTIONS} />

        <article className="space-y-10 min-w-0">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <Card>
                <header className="mb-3">
                  <h2 className="text-xl font-semibold tracking-tight">{s.title}</h2>
                  <p className="text-xs subtle mt-1">{s.oneLiner}</p>
                </header>

                <div className="space-y-4 text-sm leading-relaxed">
                  <div><span className="font-semibold">What it is:</span> <span>{s.whatItIs}</span></div>
                  <div><span className="font-semibold">Why it matters:</span> <span>{s.whyItMatters}</span></div>

                  <div>
                    <div className="font-semibold mb-1.5">How to read it</div>
                    <ul className="list-disc list-outside ml-5 space-y-1">
                      {s.howToRead.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  </div>

                  {s.faqs && s.faqs.length > 0 && (
                    <div>
                      <div className="font-semibold mb-1.5">Common questions</div>
                      <dl className="space-y-2">
                        {s.faqs.map((f, i) => (
                          <div key={i}>
                            <dt className="font-medium text-ink">{f.q}</dt>
                            <dd className="subtle mt-0.5">{f.a}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  {s.related && s.related.length > 0 && (
                    <div className="pt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] uppercase tracking-wider subtle">Related:</span>
                      {s.related.map((id) => {
                        const r = SECTIONS.find((x) => x.id === id);
                        if (!r) return null;
                        return (
                          <a key={id} href={`#${id}`} className="text-xs">
                            <Badge variant="info">{r.title}</Badge>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>
            </section>
          ))}
        </article>
      </div>

      <footer className="mt-10 p-4 text-xs subtle border-t border-line">
        <strong className="text-ink/80">Educational use only — not investment advice.</strong>{" "}
        Live data from Yahoo Finance. ETFs involve risk including possible loss of principal.
      </footer>
    </main>
  );
}
