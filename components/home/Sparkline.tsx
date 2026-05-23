"use client";

// Lightweight pure-SVG sparkline (no chart library — keeps the home page fast).
export function Sparkline({
  values,
  width = 140,
  height = 36,
  positive,
}: {
  values: number[];
  width?: number;
  height?: number;
  /** Force a tone; if omitted, inferred from first vs last value. */
  positive?: boolean;
}) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pos = positive ?? values[values.length - 1] >= values[0];
  const stroke = pos ? "#10b981" /* emerald-500 */ : "#ef4444" /* red-500 */;
  const fill = pos ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)";
  const areaPoints = `0,${height} ${points.join(" ")} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polygon points={areaPoints} fill={fill} />
      <polyline points={points.join(" ")} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
