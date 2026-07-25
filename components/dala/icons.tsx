// Line-art SVG icons for the Dala marketing page. ~1.5px stroke, no fill.
// Color is inherited via currentColor so the parent picks Lichen/Plum/Bone.
import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 64 64",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function CrystalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M32 4 L60 22 L48 60 L16 60 L4 22 Z" />
      <path d="M32 4 L48 60" />
      <path d="M32 4 L16 60" />
      <path d="M4 22 L60 22" />
      <circle cx="32" cy="22" r="3" />
    </svg>
  );
}

export function PulseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="32" cy="32" r="6" />
      <circle cx="32" cy="32" r="16" opacity="0.6" />
      <circle cx="32" cy="32" r="26" opacity="0.3" />
      <path d="M4 32 L18 32" />
      <path d="M46 32 L60 32" />
      <path d="M32 4 L32 18" />
      <path d="M32 46 L32 60" />
    </svg>
  );
}

export function BasketIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M32 6 L52 26 L32 46 L12 26 Z" />
      <path d="M32 18 L44 30 L32 42 L20 30 Z" opacity="0.55" />
      <path d="M22 50 L42 50" />
      <path d="M18 56 L46 56" />
    </svg>
  );
}

export function OrbitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="32" cy="32" rx="26" ry="10" />
      <ellipse cx="32" cy="32" rx="10" ry="26" />
      <circle cx="32" cy="32" r="3" />
      <circle cx="58" cy="32" r="2" fill="currentColor" />
      <circle cx="32" cy="6"  r="2" fill="currentColor" />
    </svg>
  );
}

// Geometric brand-mark glyph next to "InvestWith.AI" wordmark in nav.
export function WordmarkGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M32 8 L56 32 L32 56 L8 32 Z" />
      <path d="M32 20 L44 32 L32 44 L20 32 Z" opacity="0.7" />
      <circle cx="32" cy="32" r="2" fill="currentColor" />
    </svg>
  );
}
