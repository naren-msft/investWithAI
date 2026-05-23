// Concentration metrics for a weight vector.
//   HHI = Σ(w_i²)
//   effectiveN = 1 / HHI

export type ConcentrationLabel =
  | "diversified"
  | "moderate"
  | "concentrated"
  | "highly-concentrated";

export interface ConcentrationMetrics {
  hhi: number;
  effectiveN: number;
  label: ConcentrationLabel;
}

export function concentrationMetrics(weights: number[]): ConcentrationMetrics {
  const total = weights.reduce((s, w) => s + w, 0);
  const norm = total > 0 ? weights.map((w) => w / total) : weights;
  const hhi = norm.reduce((s, w) => s + w * w, 0);
  const effectiveN = hhi > 0 ? 1 / hhi : norm.length;
  let label: ConcentrationLabel;
  if (hhi < 0.10) label = "diversified";
  else if (hhi < 0.18) label = "moderate";
  else if (hhi < 0.25) label = "concentrated";
  else label = "highly-concentrated";
  return { hhi, effectiveN, label };
}
