"use client";

import { useEffect, useRef } from "react";

// =============================================================================
// DalaParticles — 2D canvas approximation of Dala's 3D pyramidal brain.
// Particles are triangle-only (pyramid silhouette), sampled inside a warped
// two-lobe brain volume, projected with a slow Y-axis rotation, depth-sorted
// each frame, and dimmed/scaled by their z position so the cloud reads as a
// rotating volumetric brain rather than a flat sphere.
//
// Performance:
//   • requestAnimationFrame loop, pauses on visibilitychange
//   • 1800 particles, depth-sort once per frame (Float32 typed work)
//   • DPR-aware crisp rendering
//   • prefers-reduced-motion → renders a single static frame
// =============================================================================

interface Particle {
  // Volume-space position on the unit brain (rotated each frame).
  u: number; v: number; w: number;
  // Per-particle baseline triangle orientation so the cloud doesn't look uniform.
  rot: number;
  size: number;
  color: string;
  // Last projected values (cached for depth-sort + draw).
  px: number; py: number; depth: number; persp: number;
}

const COUNT = 1800;
// Mostly white per Dala's brand — sparse violet/amber/lichen accents.
function pickColor(): string {
  const r = Math.random();
  if (r < 0.82) return "#ffffff";
  if (r < 0.90) return "#8052ff";
  if (r < 0.96) return "#ffb829";
  return "#15846e";
}

// Sample a point inside an asymmetric two-lobe brain volume. Rejection-sampled
// so the silhouette is naturally irregular without per-particle scripting.
function brainPoint(): { u: number; v: number; w: number } {
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = (Math.random() * 2 - 1) * 1.05;
    const y = (Math.random() * 2 - 1) * 0.95;
    const z = (Math.random() * 2 - 1) * 0.75;
    // Two-lobe condition: ellipsoid around (+lobe, 0, 0) OR (-lobe, 0, 0).
    const lobeX = 0.38;
    const cx = x > 0 ? x - lobeX : x + lobeX;
    const insideLobe =
      (cx * cx) / (0.62 * 0.62) +
      (y  * y)  / (0.85 * 0.85) +
      (z  * z)  / (0.55 * 0.55) <= 1;
    // Lower-stem narrowing — brain stem feel near the bottom.
    const stemSquash = y < -0.55 ? (Math.abs(x) < 0.18 && Math.abs(z) < 0.18) : true;
    if (insideLobe && stemSquash) {
      // Hollow out the very center slightly so depth is visible.
      const r = Math.sqrt(x*x + y*y + z*z);
      if (r > 0.18) return { u: x, v: y, w: z };
    }
  }
  // Fallback: sphere shell
  const a = Math.random() * Math.PI * 2;
  const b = Math.acos(2 * Math.random() - 1);
  return { u: Math.sin(b) * Math.cos(a), v: Math.cos(b), w: Math.sin(b) * Math.sin(a) };
}

function drawTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, color: string, alpha: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.87, s * 0.5);
  ctx.lineTo(-s * 0.87, s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function DalaParticles({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let particles: Particle[] = [];
    let rafId = 0;
    let visible = true;
    let t = 0;
    let mouseX = 0, mouseY = 0;
    let targetMx = 0, targetMy = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width  = Math.floor(rect.width  * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: COUNT }, () => {
        const p = brainPoint();
        return {
          u: p.u, v: p.v, w: p.w,
          rot: Math.random() * Math.PI * 2,
          size: 1.4 + Math.random() * 2.4,
          color: pickColor(),
          px: 0, py: 0, depth: 0, persp: 1,
        };
      });
    };

    const render = (animate: boolean) => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      // Slow Y-axis rotation plus a tiny X-tilt so we see depth from above-ish.
      if (animate) t += 0.0028;
      // Smoothed pointer parallax for subtle camera offset.
      mouseX += (targetMx - mouseX) * 0.04;
      mouseY += (targetMy - mouseY) * 0.04;
      const yaw   = t + mouseX * 0.3;
      const pitch = 0.18 + mouseY * 0.15;
      const cosY = Math.cos(yaw),  sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      const cx = w * 0.5;
      const cy = h * 0.5;
      const R  = Math.min(w, h) * 0.42;

      // Project all particles.
      for (const p of particles) {
        // Rotate around Y then X.
        const x1 =  p.u * cosY + p.w * sinY;
        const z1 = -p.u * sinY + p.w * cosY;
        const y2 =  p.v * cosP - z1 * sinP;
        const z2 =  p.v * sinP + z1 * cosP;
        const persp = 1 + z2 * 0.45;
        p.px = cx + x1 * R * persp;
        p.py = cy + y2 * R * persp;
        p.depth = z2;
        p.persp = persp;
      }

      // Depth-sort back→front so closer particles overdraw farther ones.
      particles.sort((a, b) => a.depth - b.depth);

      for (const p of particles) {
        const alpha = 0.22 + (p.depth + 1) * 0.36; // back: ~0.22 → front: ~0.94
        const size  = p.size * (0.55 + (p.depth + 1) * 0.55);
        drawTriangle(ctx, p.px, p.py, size, p.rot + t * 0.6, p.color, Math.min(1, alpha));
      }
      ctx.globalAlpha = 1;
    };

    const tick = () => {
      if (!visible) { rafId = requestAnimationFrame(tick); return; }
      render(true);
      rafId = requestAnimationFrame(tick);
    };
    const onVisibility = () => { visible = !document.hidden; };
    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetMx = (e.clientX - rect.left) / rect.width  - 0.5;
      targetMy = (e.clientY - rect.top)  / rect.height - 0.5;
    };

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointermove", onPointer, { passive: true });

    if (reduced) render(false);
    else rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
