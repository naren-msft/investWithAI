import Link from "next/link";

export default function NotFound() {
  return (
    <main className="max-w-2xl mx-auto p-6 text-center">
      <h1 className="text-2xl font-bold mb-2">ETF not found</h1>
      <p className="subtle mb-4">We couldn&apos;t find Yahoo Finance data for that ticker, or it&apos;s not a valid ETF.</p>
      <Link href="/" className="text-emerald-700 dark:text-emerald-300 underline">← Back to dashboard</Link>
    </main>
  );
}
