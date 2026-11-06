/**
 * Cleans raw per-frame shuttle detections (TrackNet peaks) into a usable
 * image-space track: drops static false positives (lights, flags, tape that
 * the background median didn't remove) and isolated outliers.
 */
import type { ShuttleSample } from "../types";

export interface CleanOptions {
  /** Analysed frames per second. */
  fps: number;
  /** Image diagonal in px (scales thresholds). */
  diagonal: number;
}

export function cleanShuttleTrack(raw: readonly ShuttleSample[], opts: CleanOptions): ShuttleSample[] {
  if (!raw.length) return [];
  // 1. Static clusters: a cell hit in > 1 s worth of frames is not a shuttle.
  const cell = Math.max(4, opts.diagonal / 160);
  const counts = new Map<string, number>();
  const key = (s: ShuttleSample) => `${Math.round(s.x / cell)}:${Math.round(s.y / cell)}`;
  for (const s of raw) counts.set(key(s), (counts.get(key(s)) ?? 0) + 1);
  const staticLimit = Math.max(8, opts.fps * 1);
  const moving = raw.filter((s) => (counts.get(key(s)) ?? 0) < staticLimit);

  // 2. Outliers: keep a point only if a temporal neighbour (≤ 3 frames away)
  //    is spatially consistent with shuttle speeds.
  const maxStep = opts.diagonal * 0.12; // px per frame
  const dtFrame = 1 / opts.fps;
  const kept: ShuttleSample[] = [];
  for (let i = 0; i < moving.length; i++) {
    const s = moving[i]!;
    let ok = false;
    for (const j of [i - 1, i + 1, i - 2, i + 2]) {
      const n = moving[j];
      if (!n) continue;
      const frames = Math.abs(n.t - s.t) / dtFrame;
      if (frames > 3.5 || frames < 0.5) continue;
      if (Math.hypot(n.x - s.x, n.y - s.y) <= maxStep * frames) {
        ok = true;
        break;
      }
    }
    if (ok) kept.push(s);
  }
  return kept;
}

/** Splits a track into continuous segments (gaps longer than maxGap s). */
export function segments(track: readonly ShuttleSample[], maxGap: number): ShuttleSample[][] {
  const out: ShuttleSample[][] = [];
  let cur: ShuttleSample[] = [];
  for (const s of track) {
    if (cur.length && s.t - cur[cur.length - 1]!.t > maxGap) {
      out.push(cur);
      cur = [];
    }
    cur.push(s);
  }
  if (cur.length) out.push(cur);
  return out;
}
