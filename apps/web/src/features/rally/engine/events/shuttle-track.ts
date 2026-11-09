/**
 * Cleans raw per-frame shuttle detections (TrackNet peaks) into a usable
 * image-space track: drops static false positives (lights, flags, tape that
 * the background median didn't remove) and isolated outliers.
 */
import type { ShuttleSample } from "@/features/rally/engine/types";

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
  const unbinned = raw.filter((s) => (counts.get(key(s)) ?? 0) < staticLimit);
  // 1b. Stationary runs: a detection that stays within a few pixels for
  //     ≥ 0.8 s is not a shuttle in flight (jitter defeats the cell test).
  const radius = Math.max(4, opts.diagonal / 160);
  const moving = unbinned.filter((s, i) => {
    let near = 0;
    let total = 0;
    let tMin = s.t;
    let tMax = s.t;
    for (let j = i; j >= 0 && s.t - unbinned[j]!.t <= 0.4; j--) {
      total++;
      if (Math.hypot(unbinned[j]!.x - s.x, unbinned[j]!.y - s.y) <= radius) {
        near++;
        tMin = Math.min(tMin, unbinned[j]!.t);
      }
    }
    for (let j = i + 1; j < unbinned.length && unbinned[j]!.t - s.t <= 0.4; j++) {
      total++;
      if (Math.hypot(unbinned[j]!.x - s.x, unbinned[j]!.y - s.y) <= radius) {
        near++;
        tMax = Math.max(tMax, unbinned[j]!.t);
      }
    }
    return !(total >= 12 && near >= 0.75 * total && tMax - tMin >= 0.8);
  });

  const flying = moving;

  // 2. Outliers: keep a point only if a temporal neighbour (≤ 3 frames away)
  //    is spatially consistent with shuttle speeds.
  const maxStep = opts.diagonal * 0.12; // px per frame
  const dtFrame = 1 / opts.fps;
  const kept: ShuttleSample[] = [];
  for (let i = 0; i < flying.length; i++) {
    const s = flying[i]!;
    let ok = false;
    for (const j of [i - 1, i + 1, i - 2, i + 2]) {
      const n = flying[j];
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
  // 3. Slow crawls: a shuttle in flight never moves slowly for long (its
  //    slow moments — apex, coming at the camera — last < 0.5 s). A white
  //    shoe or a shuttle on the floor does.
  const slow = slowStretches(kept, Math.max(20, opts.diagonal * 0.04), 1.0);
  return kept.filter((_, i) => !slow[i]);
}

/**
 * Marks slow samples inside regions (≥ minDur s) dominated by slow motion
 * (< `speed` px/s over ±0.25 s). Fast samples interleaved in such a region
 * (a real flight while a false positive crawls) are kept.
 */
export function slowStretches(track: readonly ShuttleSample[], speed: number, minDur: number): boolean[] {
  const n = track.length;
  const isSlow = track.map((s, i) => {
    let a = i;
    let b = i;
    while (a > 0 && s.t - track[a - 1]!.t <= 0.25) a--;
    while (b < n - 1 && track[b + 1]!.t - s.t <= 0.25) b++;
    const dt = track[b]!.t - track[a]!.t;
    if (dt < 0.2) return false;
    // Median-ish robustness: use the smaller of the two half-window speeds.
    const v1 = Math.hypot(track[i]!.x - track[a]!.x, track[i]!.y - track[a]!.y) / Math.max(0.05, s.t - track[a]!.t);
    const v2 = Math.hypot(track[b]!.x - track[i]!.x, track[b]!.y - track[i]!.y) / Math.max(0.05, track[b]!.t - s.t);
    return Math.min(v1, v2) < speed;
  });
  const dominated = track.map((s, i) => {
    let slow = 0;
    let all = 0;
    for (let j = i; j >= 0 && s.t - track[j]!.t <= 0.5; j--) {
      all++;
      if (isSlow[j]) slow++;
    }
    for (let j = i + 1; j < n && track[j]!.t - s.t <= 0.5; j++) {
      all++;
      if (isSlow[j]) slow++;
    }
    return all >= 8 && slow >= 0.6 * all;
  });
  const out = new Array<boolean>(n).fill(false);
  let start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && dominated[i] && (start < 0 || track[i]!.t - track[i - 1]!.t <= 0.4)) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0 && track[i - 1]!.t - track[start]!.t >= minDur) {
      for (let k = start; k < i; k++) if (isSlow[k]) out[k] = true;
    }
    start = i < n && dominated[i] ? i : -1;
  }
  return out;
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
