// Scores engine output vs ShuttleSet labels (hit precision/recall ±0.15 s
// after removing the video↔label time offset, hitter side, shot type).
//   cd web && DATA=/path/to/data/ bun ../tools/eval/shuttleset/score.ts [--replay] [-v]
// --replay re-runs tracking + events on the saved raw detections (fast tuning loop).
const E = process.env.ENGINE ?? new URL("../../../web/src/rally/engine", import.meta.url).pathname;
const { trackPlayers } = await import(`${E}/tracking/player-tracker.ts`);
const { cleanShuttleTrack } = await import(`${E}/events/shuttle-track.ts`);
const { buildShots } = await import(`${E}/events/shots.ts`);
const { cameraFromHomography } = await import(`${E}/geometry/camera.ts`);
const { applyH, mat3Inv } = await import(`${E}/geometry/linalg.ts`);
const { personHeight } = await import(`${E}/analysis/analyze.ts`);
const DIR = process.env.DATA ?? process.env.HOME + "/.cache/rally-lab/shuttleset/";
const truth = JSON.parse(await Bun.file(DIR + "truth.json").text());
const replay = process.argv.includes("--replay");
const TOL = 0.15;
let T = 0, P = 0, M = 0, sideOk = 0, typeOk = 0;
const runs: { r: any; shots: any[]; players: any[] }[] = [];
const conf: Record<string, Record<string, number>> = {};
for (const r of truth.rallies) {
  const f = Bun.file(DIR + "results/" + r.clip.split("/")[1].replace(".mp4", ".json"));
  if (!(await f.exists())) continue;
  const res = JSON.parse(await f.text());
  if (!res) continue;
  let shots = res.shots, players = res.players;
  if (replay && res.debug) {
    const W = res.video.width, H = res.video.height, fps = res.video.analysedFps;
    const Hinv = mat3Inv(res.calibration.H); const cam = cameraFromHomography(res.calibration.H, W, H);
    const tracked = trackPlayers(res.debug.frames, { toCourt: (p: any) => applyH(Hinv, p), format: process.env.FORMAT, heightOf: (b: any, c: any) => personHeight(cam, b, c, H) });
    const track = cleanShuttleTrack(res.debug.shuttleRaw, { fps, diagonal: Math.hypot(W, H) });
    const sides = Object.fromEntries(tracked.players.map((p: any) => [p.id, p.side]));
    shots = buildShots({ track, tracks: tracked.tracks, sides, camera: cam, fps, diagonal: Math.hypot(W, H) }).shots;
    players = tracked.players;
  }
  runs.push({ r, shots, players });
}
// Global time alignment between the downloaded video and the dataset's frame
// numbers (median signed offset of nearest pairs), removed before matching.
const offs: number[] = [];
for (const { r, shots } of runs) for (const g of r.shots) {
  let best: number | null = null;
  for (const p of shots) if (Math.abs(p.t - g.t) <= 0.35 && (best === null || Math.abs(p.t - g.t) < Math.abs(best))) best = p.t - g.t;
  if (best !== null) offs.push(best);
}
offs.sort((a, b) => a - b);
const OFFSET = process.env.NO_ALIGN ? 0 : (offs[offs.length >> 1] ?? 0);
console.log(`alignment offset ${OFFSET.toFixed(3)} s (from ${offs.length} pairs)`);
for (const { r, shots: raw, players } of runs) {
  const shots = raw.map((p: any) => ({ ...p, t: p.t - OFFSET }));
  const sideOf = (id: string | null) => players.find((p: any) => p.id === id)?.side ?? 0;
  const gt = r.shots;
  const pairs: any[] = [];
  shots.forEach((p: any, i: number) => gt.forEach((g: any, j: number) => { const d = Math.abs(p.t - g.t); if (d <= TOL) pairs.push({ i, j, d }); }));
  pairs.sort((a, b) => a.d - b.d);
  const uP = new Set(), uG = new Set(); let m = 0;
  for (const { i, j } of pairs) {
    if (uP.has(i) || uG.has(j)) continue; uP.add(i); uG.add(j); m++;
    const p = shots[i], g = gt[j];
    if (sideOf(p.hitter) === g.side) sideOk++;
    if (p.type === g.type) typeOk++;
    (conf[g.type] ??= {})[p.type] = (conf[g.type]![p.type] ?? 0) + 1;
  }
  T += gt.length; P += shots.length; M += m;
  if (process.argv.includes("-v")) console.log(r.clip, `truth ${gt.length} pred ${shots.length} matched ${m}`);
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
console.log(`hits: truth ${T} predicted ${P} matched ${M} → precision ${pct(M, P)} recall ${pct(M, T)} | side ${pct(sideOk, M)} | type ${pct(typeOk, M)}`);
console.log("confusion (truth → predicted):");
for (const [g, row] of Object.entries(conf)) console.log("  " + g.padEnd(6), JSON.stringify(row));
