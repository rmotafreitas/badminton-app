/**
 * Stats are always derived, never stored as truth: computeStats() runs on the
 * engine output after applyCorrections(), so every person's edit (shot type,
 * deleted false hit, label swap) is reflected everywhere.
 */
import { distanceCovered } from "./tracking/player-tracker";
import type {
  AnalysisResult,
  Corrections,
  PlayerId,
  PlayerStats,
  PlayerTrack,
  SessionStats,
  Shot,
  ShotType,
} from "./types";
import { TRACK_HZ } from "./types";

const HEAT_COLS = 6;
const HEAT_ROWS = 13;

function heatmap(tr: PlayerTrack): number[] {
  const grid = new Array<number>(HEAT_COLS * HEAT_ROWS).fill(0);
  for (let i = 0; i < tr.court.length / 2; i++) {
    const x = tr.court[i * 2]!;
    const y = tr.court[i * 2 + 1]!;
    if (Number.isNaN(x)) continue;
    const c = Math.floor(((x + 3.05) / 6.1) * HEAT_COLS);
    const r = Math.floor(((y + 6.7) / 13.4) * HEAT_ROWS);
    if (c < 0 || c >= HEAT_COLS || r < 0 || r >= HEAT_ROWS) continue;
    grid[r * HEAT_COLS + c]!++;
  }
  return grid;
}

/** Speeds people can trust: reviewed, or physics fit with a solid constraint. */
const trustedSpeed = (s: Shot) => s.speedKmh !== null && (s.reviewed || s.speedConfidence !== "low");

export function computeStats(r: Pick<AnalysisResult, "tracks" | "shots" | "rallies" | "players">): SessionStats {
  const live = r.shots.filter((s) => !s.deleted);
  const players: PlayerStats[] = r.players.map((p) => {
    const tr = r.tracks.find((t) => t.id === p.id);
    const mine = live.filter((s) => s.hitter === p.id);
    const byType: Partial<Record<ShotType, number>> = {};
    for (const s of mine) byType[s.type] = (byType[s.type] ?? 0) + 1;
    const speeds = mine.filter(trustedSpeed).map((s) => s.speedKmh!);
    return {
      id: p.id,
      distanceM: tr ? Math.round(distanceCovered(tr)) : 0,
      shots: mine.length,
      shotsByType: byType,
      maxSpeedKmh: speeds.length ? Math.max(...speeds) : null,
      avgSpeedKmh: speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null,
      heatmap: tr ? heatmap(tr) : [],
    };
  });
  const rallyLens = r.rallies
    .map((ra) => ra.shotIds.filter((id) => live.some((s) => s.id === id)).length)
    .filter((n) => n > 0);
  return {
    rallies: rallyLens.length,
    shots: live.length,
    avgRallyShots: rallyLens.length
      ? Math.round((rallyLens.reduce((a, b) => a + b, 0) / rallyLens.length) * 10) / 10
      : 0,
    longestRallyShots: rallyLens.length ? Math.max(...rallyLens) : 0,
    players,
  };
}

/** Swaps two players' track samples from time t onwards (fixes an ID switch). */
function swapTracks(tracks: PlayerTrack[], t: number, a: PlayerId, b: PlayerId) {
  const A = tracks.find((x) => x.id === a);
  const B = tracks.find((x) => x.id === b);
  if (!A || !B) return;
  const from = Math.max(0, Math.round((t - A.t0) * TRACK_HZ));
  for (const [w, key] of [[2, "court"], [4, "boxes"]] as const) {
    for (let i = from * w; i < A[key].length; i++) {
      const tmp = A[key][i]!;
      A[key][i] = B[key][i]!;
      B[key][i] = tmp;
    }
  }
}

/** Returns a new result with corrections applied and stats recomputed. */
export function applyCorrections(result: AnalysisResult, c: Corrections | undefined): AnalysisResult {
  if (!c) return { ...result, stats: computeStats(result) };
  const tracks = result.tracks.map((t) => ({ ...t, court: [...t.court], boxes: [...t.boxes] }));
  let shots = result.shots.map((s) => ({ ...s }));
  for (const [t, a, b] of c.swaps ?? []) {
    swapTracks(tracks, t, a, b);
    shots = shots.map((s) =>
      s.t >= t && (s.hitter === a || s.hitter === b) ? { ...s, hitter: s.hitter === a ? b : a } : s,
    );
  }
  shots = shots.map((s) => {
    const fix = c.shots?.[s.id];
    return fix ? { ...s, ...fix, reviewed: true } : s;
  });
  // Missed hits added by a person go into the rally they fall in (or the
  // nearest one), without physics.
  let rallies = result.rallies.map((r) => ({ ...r, shotIds: [...r.shotIds] }));
  for (const a of c.added ?? []) {
    const fix = c.shots?.[a.id];
    let rally = rallies.find((r) => a.t >= r.start - 1.5 && a.t <= r.end + 1.5);
    if (!rally) {
      rally = { id: `r-added-${a.id}`, start: a.t, end: a.t + 1.5, shotIds: [] };
      rallies.push(rally);
    }
    rally.start = Math.min(rally.start, a.t);
    rally.end = Math.max(rally.end, a.t);
    rally.shotIds.push(a.id);
    shots.push({
      id: a.id,
      rallyId: rally.id,
      t: a.t,
      hitter: a.hitter,
      type: a.type,
      typeConfidence: "high",
      speedKmh: null,
      avgSpeedKmh: null,
      speedConfidence: "low",
      contactHeight: null,
      apexHeight: null,
      flightTime: null,
      landing: null,
      reviewed: true,
      ...fix,
    });
  }
  shots.sort((x, y) => x.t - y.t);
  rallies = rallies
    .map((r) => ({ ...r, shotIds: shots.filter((s) => s.rallyId === r.id).map((s) => s.id) }))
    .sort((x, y) => x.start - y.start);
  const players = result.players.map((p) => {
    const u = c.players?.[p.id];
    if (!u) return p;
    return u.userId ? { ...p, userId: u.userId } : { id: p.id, side: p.side };
  });
  const next = { ...result, tracks, shots, rallies, players, format: c.format ?? result.format };
  return { ...next, stats: computeStats(next) };
}
