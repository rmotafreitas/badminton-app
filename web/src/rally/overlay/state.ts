/**
 * What the overlay shows at time t — pure data, no drawing. Precompute once
 * per result (prepareOverlay), then frameState() is cheap enough per frame.
 */
import type { Vec2 } from "../engine/geometry/linalg";
import { boxAt, positionAt } from "../engine/tracking/player-tracker";
import type { AnalysisResult, PlayerId, Shot, ShuttleSample } from "../engine/types";
import { TRACK_HZ } from "../engine/types";

export interface PreparedOverlay {
  result: AnalysisResult;
  /** Cumulative distance (m) per player per 10 Hz sample. */
  cumDistance: Map<PlayerId, Float32Array>;
  shots: Shot[];
  /** Display names for linked players (else the P-label). */
  names: Partial<Record<PlayerId, string>>;
}

export function prepareOverlay(
  result: AnalysisResult,
  names: Partial<Record<PlayerId, string>> = {},
): PreparedOverlay {
  const cumDistance = new Map<PlayerId, Float32Array>();
  for (const tr of result.tracks) {
    const n = tr.court.length / 2;
    const cum = new Float32Array(n);
    let d = 0;
    let prev: Vec2 | null = null;
    for (let i = 0; i < n; i++) {
      // Same 0.3 s smoothing as stats.distanceCovered, so numbers agree.
      let sx = 0;
      let sy = 0;
      let c = 0;
      for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) {
        const x = tr.court[k * 2]!;
        if (Number.isNaN(x)) continue;
        sx += x;
        sy += tr.court[k * 2 + 1]!;
        c++;
      }
      const p = c && !Number.isNaN(tr.court[i * 2]!) ? { x: sx / c, y: sy / c } : null;
      if (p && prev) {
        const step = Math.hypot(p.x - prev.x, p.y - prev.y);
        if (step > 0.02 && step < 1.2) d += step;
      }
      if (p) prev = p;
      cum[i] = d;
    }
    cumDistance.set(tr.id, cum);
  }
  const shots = result.shots.filter((s) => !s.deleted).sort((a, b) => a.t - b.t);
  return { result, cumDistance, shots, names };
}

export interface PlayerFrame {
  id: PlayerId;
  name: string;
  box: [number, number, number, number] | null;
  court: Vec2 | null;
  distanceM: number;
}

export interface FrameState {
  t: number;
  players: PlayerFrame[];
  trail: ShuttleSample[];
  /** Most recent shot, shown while `shotAge` < ~1.6 s. */
  lastShot: Shot | null;
  shotAge: number;
  /** 1-based index of the last shot within its rally. */
  shotIndex: number;
  /** Shots so far in the current rally; or the total after it ended. */
  shotCount: number;
  rallyOver: boolean;
  /** Latest speed worth showing (km/h). */
  speedKmh: number | null;
  /** Landing spot of the last shot (court m). */
  landing: Vec2 | null;
}

export function frameState(p: PreparedOverlay, t: number): FrameState {
  const r = p.result;
  const players: PlayerFrame[] = r.tracks.map((tr) => {
    const cum = p.cumDistance.get(tr.id);
    const i = Math.max(0, Math.min((cum?.length ?? 1) - 1, Math.floor((t - tr.t0) * TRACK_HZ)));
    return {
      id: tr.id,
      name: p.names[tr.id] ?? tr.id,
      box: boxAt(tr, t),
      court: positionAt(tr, t),
      distanceM: cum ? cum[i]! : 0,
    };
  });

  // Shuttle trail: the last 0.45 s of samples (binary search for speed).
  const samples = r.shuttle;
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t <= t) lo = mid + 1;
    else hi = mid;
  }
  const trail: ShuttleSample[] = [];
  for (let i = lo - 1; i >= 0 && samples[i]!.t >= t - 0.45; i--) trail.unshift(samples[i]!);

  let lastShot: Shot | null = null;
  for (const s of p.shots) {
    if (s.t <= t) lastShot = s;
    else break;
  }
  const rally = lastShot ? r.rallies.find((ra) => ra.id === lastShot!.rallyId) : undefined;
  const rallyShots = rally ? p.shots.filter((s) => s.rallyId === rally.id) : [];
  const rallyOver = !!rally && t > rally.end;
  const shotIndex = lastShot ? rallyShots.findIndex((s) => s.id === lastShot!.id) + 1 : 0;
  // Between rallies, show the last speed only while the shot label is up.
  const shotAge = lastShot ? t - lastShot.t : Infinity;
  const speedKmh =
    lastShot && shotAge < 2.5
      ? lastShot.speedConfidence !== "low"
        ? lastShot.speedKmh
        : lastShot.avgSpeedKmh
      : null;
  return {
    t,
    players,
    trail,
    lastShot,
    shotAge,
    shotIndex,
    shotCount: rallyOver ? rallyShots.length : shotIndex,
    rallyOver,
    speedKmh,
    landing: lastShot?.landing ?? null,
  };
}
