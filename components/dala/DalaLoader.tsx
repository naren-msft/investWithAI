"use client";

import { useEffect, useState } from "react";

// Site loader splash modeled on Dala's first-paint experience:
//   • SVG spinner scales in (cubic-bezier .14 -.14 .78 .52) then rotates
//     3s ease-in-out infinite — perceptibly slower & smoother than a constant
//     linear spin.
//   • Two stacked heading lines slide up + un-rotate (cubic-bezier .76 0 .24 1)
//     with 0.15s stagger.
//   • Three separate meta elements at the bottom: "LOADING ..." (left),
//     "Completed" badge in amber (center), three-digit "000" counter (right).
//   • Shows only once per session.
export function DalaLoader() {
  const [shouldRender, setShouldRender] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("dala-loader-seen") === "1") return;
    setShouldRender(true);
    sessionStorage.setItem("dala-loader-seen", "1");

    const start = performance.now();
    const DURATION = 1800;
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - start;
      const pct = Math.min(100, Math.floor((elapsed / DURATION) * 100));
      setProgress(pct);
      if (elapsed < DURATION) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // The CSS keyframe handles fade-out at 2300ms; remove from DOM shortly after.
    const removeT = setTimeout(() => setShouldRender(false), 2900);
    return () => { cancelAnimationFrame(raf); clearTimeout(removeT); };
  }, []);

  if (!shouldRender) return null;

  const complete = progress >= 100;
  const digits = String(progress).padStart(3, "0").split("");

  return (
    <div className={`dala-loader${complete ? " is-complete" : ""}`} aria-hidden="true">
      <svg className="dala-loader__spinner" viewBox="0 0 142 141" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="63.6"  y="0"     width="14.8" height="14.8" fill="#fff" />
        <rect x="63.6"  y="125.7" width="14.8" height="14.8" fill="#fff" />
        <rect x="127.2" y="62.1"  width="14.8" height="14.8" fill="#fff" />
        <rect x="0"     y="62.1"  width="16.3" height="14.8" fill="#fff" />
      </svg>
      <div className="dala-loader__heading">
        <div className="dala-loader__line">
          <span className="dala-loader__line-inner" style={{ ["--i" as string]: 0 }}>
            Your workplace, your signals.
          </span>
        </div>
        <div className="dala-loader__line">
          <span
            className="dala-loader__line-inner"
            style={{ ["--i" as string]: 1, color: "#8052ff" }}
          >
            Ask InvestWith.AI.
          </span>
        </div>
      </div>
      <div className="dala-loader__meta">
        <span className="dala-loader__loading">
          LOADING<span className="dala-loader__loading-dots">...</span>
        </span>
        <span className="dala-loader__completed">Completed</span>
        <span className="dala-loader__progress">
          {digits.map((d, i) => <span key={i}>{d}</span>)}
        </span>
      </div>
    </div>
  );
}
