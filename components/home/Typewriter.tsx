"use client";

import { useEffect, useState } from "react";

const TYPE_MS = 55;
const ERASE_MS = 25;
const HOLD_MS = 1800;

export function Typewriter({ phrases, className }: { phrases: string[]; className?: string }) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "holding" | "erasing">("typing");

  useEffect(() => {
    const target = phrases[idx] ?? "";
    let timer: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (text.length < target.length) {
        timer = setTimeout(() => setText(target.slice(0, text.length + 1)), TYPE_MS);
      } else {
        timer = setTimeout(() => setPhase("holding"), 0);
      }
    } else if (phase === "holding") {
      timer = setTimeout(() => setPhase("erasing"), HOLD_MS);
    } else {
      if (text.length > 0) {
        timer = setTimeout(() => setText(text.slice(0, -1)), ERASE_MS);
      } else {
        setIdx((i) => (i + 1) % phrases.length);
        setPhase("typing");
      }
    }
    return () => clearTimeout(timer);
  }, [text, phase, idx, phrases]);

  return (
    <span className={className}>
      {text}
      <span className="inline-block w-[2px] h-[1em] align-middle ml-0.5 bg-emerald-500 animate-pulse" />
    </span>
  );
}
