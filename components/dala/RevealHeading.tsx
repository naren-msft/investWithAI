// RevealHeading — splits children text into per-word spans wrapped in lines
// that get the dalaWordRise CSS animation. Use as drop-in for h1/h2 in the
// Dala marketing surface. Pure CSS animation — no JS runtime cost after first
// render. Accepts an array of lines so we control where line breaks occur.
//
// Example:
//   <RevealHeading lines={["Invest with", "intent."]} className="dala-hero" />
//
import type { CSSProperties } from "react";

interface Props {
  lines: string[];
  className?: string;        // applied to the wrapper element (e.g. dala-hero)
  as?: "h1" | "h2" | "h3" | "div";
  baseDelay?: number;        // ms before the first word animates in
  style?: CSSProperties;
}

export function RevealHeading({ lines, className, as = "h1", baseDelay = 0, style }: Props) {
  const Tag = as as any;
  let wordIdx = 0;
  return (
    <Tag className={`dala-reveal ${className ?? ""}`} style={style}>
      {lines.map((line, li) => (
        <span key={li} className="reveal-line">
          {line.split(/\s+/).filter(Boolean).map((w, wi) => {
            const i = wordIdx++;
            return (
              <span
                key={`${li}-${wi}`}
                className="reveal-word"
                style={{ ["--i" as any]: i, ["--base-delay" as any]: `${baseDelay}ms` }}
              >
                {w}{wi < line.split(/\s+/).filter(Boolean).length - 1 ? "\u00A0" : ""}
              </span>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}
