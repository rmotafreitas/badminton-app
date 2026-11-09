/**
 * What the overlay shows at time t — pure data, no drawing. Precompute once
 * per result (prepareOverlay), then frameState() is cheap enough per frame.
 */
import type { Vec2 } from "@/features/rally/engine/geometry/linalg";
import { boxAt, pathLength, positionAt, smoothTrack } from "@/features/rally/engine/tracking/player-tracker";
import type { AnalysisResult, PlayerId, Shot, ShuttleSample } from "@/features/rally/engine/types";
import { TRACK_HZ } from "@/features/rally/engine/types";

/** Below this, an estimated (low-confidence) speed is noise, not a shot. */
const MIN_SHOWN_FALLBACK_KMH = 15;

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
    // Same smoothing as stats.distanceCovered, so the overlay ends on the
    // same number the stats show.
    cumDistance.set(tr.id, Float32Array.from(pathLength(smoothTrack(tr))));
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
  // A low-confidence fallback (average speed to the next contact) is only
  // shown when plausible: "SMASH ~5 km/h" helps nobody.
  const fallback = lastShot?.avgSpeedKmh ?? null;
  const speedKmh =
    lastShot && shotAge < 2.5
      ? lastShot.speedConfidence !== "low"
        ? lastShot.speedKmh
        : fallback !== null && fallback >= MIN_SHOWN_FALLBACK_KMH
          ? fallback
          : null
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
