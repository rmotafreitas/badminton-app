/**
 * Engine evaluation against a person-reviewed session (ground truth =
 * engine output + corrections, when the reviewer marked it complete).
 */
import type { Shot, ShotType } from "./types";

export interface EvalReport {
  truthShots: number;
  predictedShots: number;
  matched: number;
  /** Detected hits that are real. */
  hitPrecision: number;
  /** Real hits that were detected (within `tolerance` s). */
  hitRecall: number;
  hitF1: number;
  /** Among matched hits. */
  hitterAccuracy: number;
  typeAccuracy: number;
  meanTimeError: number;
  confusion: Partial<Record<ShotType, Partial<Record<ShotType, number>>>>;
}

/** Greedy one-to-one matching by time (closest pairs first). */
export function evaluateShots(predicted: readonly Shot[], truth: readonly Shot[], tolerance = 0.2): EvalReport {
  const pred = predicted.filter((s) => !s.deleted);
  const gt = truth.filter((s) => !s.deleted);
  const pairs: { i: number; j: number; d: number }[] = [];
  pred.forEach((p, i) =>
    gt.forEach((g, j) => {
      const d = Math.abs(p.t - g.t);
      if (d <= tolerance) pairs.push({ i, j, d });
    }),
  );
  pairs.sort((a, b) => a.d - b.d);
  const usedP = new Set<number>();
  const usedG = new Set<number>();
  const matches: { p: Shot; g: Shot; d: number }[] = [];
  for (const { i, j, d } of pairs) {
    if (usedP.has(i) || usedG.has(j)) continue;
    usedP.add(i);
    usedG.add(j);
    matches.push({ p: pred[i]!, g: gt[j]!, d });
  }
  const confusion: EvalReport["confusion"] = {};
  for (const { p, g } of matches) {
    const row = (confusion[g.type] ??= {});
    row[p.type] = (row[p.type] ?? 0) + 1;
  }
  const precision = pred.length ? matches.length / pred.length : 0;
  const recall = gt.length ? matches.length / gt.length : 0;
  const ratio = (n: number) => (matches.length ? n / matches.length : 0);
  return {
    truthShots: gt.length,
    predictedShots: pred.length,
    matched: matches.length,
    hitPrecision: precision,
    hitRecall: recall,
    hitF1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    hitterAccuracy: ratio(matches.filter((m) => m.p.hitter === m.g.hitter).length),
    typeAccuracy: ratio(matches.filter((m) => m.p.type === m.g.type).length),
    meanTimeError: ratio(matches.reduce((s, m) => s + m.d, 0)),
    confusion,
  };
}
