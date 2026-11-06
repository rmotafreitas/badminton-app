/**
 * Scores the analysis engine against person-reviewed sessions.
 *
 *   bun tools/eval/evaluate.ts session1-analysis.json [session2-analysis.json …]
 *
 * Input files come from the session page → "Download analysis (JSON)". Only
 * sessions whose review was marked complete ("I checked every shot") are
 * ground truth; others are reported but excluded from the totals.
 */
import { evaluateShots, type EvalReport } from "../../web/src/rally/engine/eval";
import { applyCorrections } from "../../web/src/rally/engine/stats";
import type { AnalysisResult, Corrections } from "../../web/src/rally/engine/types";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: bun tools/eval/evaluate.ts <analysis.json>…");
  process.exit(1);
}
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const totals = { truth: 0, pred: 0, matched: 0, hitter: 0, type: 0 };
for (const f of files) {
  const { result, corrections } = JSON.parse(await Bun.file(f).text()) as {
    result: AnalysisResult;
    corrections: Corrections;
  };
  const truth = applyCorrections(result, corrections).shots;
  const r: EvalReport = evaluateShots(result.shots, truth);
  const complete = !!corrections?.reviewedComplete;
  console.log(
    `${f}${complete ? "" : "  (review not marked complete — excluded from totals)"}\n` +
      `  hits: precision ${pct(r.hitPrecision)} recall ${pct(r.hitRecall)} F1 ${pct(r.hitF1)} ` +
      `(${r.matched}/${r.truthShots} truth, ${r.predictedShots} predicted, ±${r.meanTimeError.toFixed(2)} s)\n` +
      `  hitter ${pct(r.hitterAccuracy)} · type ${pct(r.typeAccuracy)}\n` +
      `  type confusion (truth → predicted): ${JSON.stringify(r.confusion)}`,
  );
  if (!complete) continue;
  totals.truth += r.truthShots;
  totals.pred += r.predictedShots;
  totals.matched += r.matched;
  totals.hitter += r.hitterAccuracy * r.matched;
  totals.type += r.typeAccuracy * r.matched;
}
if (totals.truth) {
  console.log(
    `\nALL: precision ${pct(totals.matched / totals.pred)} recall ${pct(totals.matched / totals.truth)} ` +
      `hitter ${pct(totals.hitter / totals.matched)} type ${pct(totals.type / totals.matched)}`,
  );
}
