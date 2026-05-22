import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "rgb(var(--bg) / <alpha-value>)",
          card:    "rgb(var(--surface-1) / <alpha-value>)",
        },
        surface: {
          1: "rgb(var(--surface-1) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)",
          3: "rgb(var(--surface-3) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted:   "rgb(var(--ink-muted) / <alpha-value>)",
        },
        line: "rgb(var(--line) / <alpha-value>)",
        brand: { DEFAULT: "#22c55e", dim: "#16a34a" },
        danger: "#ef4444",
        warn: "#f59e0b",
      },
      boxShadow: {
        card: "0 1px 0 rgb(var(--shadow-inset) / 0.06) inset, 0 8px 24px rgb(var(--shadow) / 0.18)",
      },
    },
  },
  plugins: [],
};
export default config;
