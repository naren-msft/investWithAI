import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
