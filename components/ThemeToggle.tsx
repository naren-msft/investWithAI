"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function getInitial(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitial());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("theme", next); } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={
        "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 " +
        "text-sm px-2.5 py-1.5 transition-colors " + className
      }
    >
      {mounted ? (
        theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />
      ) : (
        <Sun className="w-4 h-4 opacity-0" />
      )}
      <span className="text-xs">{mounted ? (theme === "dark" ? "Light" : "Dark") : ""}</span>
    </button>
  );
}
