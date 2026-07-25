import Link from "next/link";
import { WordmarkGlyph } from "./icons";

export function DalaFooter() {
  return (
    <footer className="dala-section" style={{ paddingTop: 48, paddingBottom: 48 }}>
      <div className="dala-shell">
        <hr className="dala-divider" style={{ marginBottom: 36 }} />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <WordmarkGlyph width={20} height={20} style={{ color: "#8052ff" }} />
            <span className="dala-subheading" style={{ fontWeight: 600, fontSize: 16 }}>
              InvestWith.AI
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link className="dala-nav-link" href="/fomc">FOMC</Link>
            <Link className="dala-nav-link" href="/etf">ETF</Link>
            <Link className="dala-nav-link" href="/stocks">STOCKS</Link>
            <Link className="dala-nav-link" href="/screener">SCREENER</Link>
          </div>
          <p className="dala-caption">© {new Date().getFullYear()} · Personal research, not advice.</p>
        </div>
      </div>
    </footer>
  );
}
