import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { findSection } from "@/lib/sections";

export function HelpLink({ section }: { section: string }) {
  const sec = findSection(section);
  return (
    <Link
      href={`/help#${section}`}
      title={sec?.oneLiner ?? "What is this?"}
      aria-label={sec ? `Help: ${sec.title}` : "Help"}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-ink-muted hover:text-brand hover:bg-surface-3 transition-colors shrink-0"
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </Link>
  );
}
