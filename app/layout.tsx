import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";

// Inter Tight — the closest free substitute for PP Neue Montreal used by
// the real Dala site. Scoped via CSS variable so it only takes effect inside
// `.dala` (see globals.css).
const acronym = Inter_Tight({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--font-acronym",
  display: "swap",
});

export const metadata: Metadata = {
  title: "InvestWithAI · ETF Portfolio Dashboard",
  description:
    "Multi-agent ETF allocation dashboard with staged capital deployment, RSI/MACD signals, and Fidelity trade tickets.",
};

const themeInit = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch(e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={acronym.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
