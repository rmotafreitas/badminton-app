/**
 * What goes into an exported clip and how it's framed — pure, no media APIs.
 *
 * - Scope: the whole video, rallies (dead time between them cut), or one shot.
 * - Format: landscape 16:9 (desktop / YouTube) or vertical 9:16 (TikTok,
 *   Reels, Shorts).
 * - Framing when the aspect changes: the whole court letterboxed, or a
 *   virtual camera that pans to follow the action or one player.
 */
import { boxAt } from "../engine/tracking/player-tracker";
import type { AnalysisResult, PlayerId } from "../engine/types";

export type ClipScope = { kind: "all" } | { kind: "rallies"; ids: string[] } | { kind: "shot"; id: string };
export type ClipFormat = "landscape" | "vertical";
export type ClipFraming = { kind: "court" } | { kind: "action" } | { kind: "player"; id: PlayerId };

export interface Segment {
  start: number;
  end: number;
}

/** Lead-in / tail around a rally so the serve and the last landing are in. */
export const RALLY_PAD = { before: 1.2, after: 1.5 };
/** Around a single shot: the swing before, the flight (up to the next hit) after. */
export const SHOT_PAD = { before: 1.5, minAfter: 1.5, maxAfter: 4, afterNext: 0.6, noNext: 2.5 };

type ResultLike = Pick<AnalysisResult, "rallies" | "shots" | "tracks" | "shuttle" | "video">;

export function clipSegments(r: ResultLike, scope: ClipScope, durationS: number): Segment[] {
  const clamp = (s: Segment): Segment => ({ start: Math.max(0, s.start), end: Math.min(durationS, s.end) });
  if (scope.kind === "all") return [{ start: 0, end: durationS }];
  if (scope.kind === "shot") {
    const live = r.shots.filter((s) => !s.deleted).sort((a, b) => a.t - b.t);
    const i = live.findIndex((s) => s.id === scope.id);
    if (i < 0) return [];
    const s = live[i]!;
    const next = live[i + 1]?.rallyId === s.rallyId ? live[i + 1] : undefined;
    const after = next
      ? Math.min(SHOT_PAD.maxAfter, Math.max(SHOT_PAD.minAfter, next.t - s.t + SHOT_PAD.afterNext))
      : SHOT_PAD.noNext;
    return [clamp({ start: s.t - SHOT_PAD.before, end: s.t + after })];
  }
  const segs = r.rallies
    .filter((ra) => scope.ids.includes(ra.id))
    .sort((a, b) => a.start - b.start)
    .map((ra) => clamp({ start: ra.start - RALLY_PAD.before, end: ra.end + RALLY_PAD.after }));
  // Rallies that overlap (or nearly touch) once padded play as one.
  const merged: Segment[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end + 0.5) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged.filter((s) => s.end - s.start > 0.1);
}

export const segmentsDuration = (segs: Segment[]) => segs.reduce((a, s) => a + (s.end - s.start), 0);

const ASPECT: Record<ClipFormat, number> = { landscape: 16 / 9, vertical: 9 / 16 };

/** Output size: 1280×720 or 720×1280 (never upscaled past 1.5× the source). */
export function outputSize(format: ClipFormat, srcW: number, srcH: number): { width: number; height: number } {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  const long = Math.min(1280, Math.round(Math.max(srcW, srcH) * 1.5));
  return format === "vertical"
    ? { width: even((long * 9) / 16), height: even(long) }
    : { width: even(long), height: even((long * 9) / 16) };
}

/** Whether the source already has (about) the target aspect: no crop needed. */
export function sameAspect(format: ClipFormat, srcW: number, srcH: number): boolean {
  return Math.abs(srcW / srcH / ASPECT[format] - 1) < 0.08;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** First index with v[i] >= x (v sorted ascending). */
function lowerBound(v: number[], x: number): number {
  let lo = 0;
  let hi = v.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (v[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const CAMERA_HZ = 10;
/** Gaussian smoothing of the camera target (s): no jitter, still keeps up with a rally. */
const CAMERA_SIGMA = 0.55;
/** Fastest pan, in window widths per second. */
const MAX_PAN = 0.9;

function gaussianSmooth(v: number[], sigma: number): number[] {
  const r = Math.ceil(sigma * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  return v.map((_, i) => {
    let s = 0;
    let w = 0;
    for (let j = -r; j <= r; j++) {
      const x = v[Math.min(v.length - 1, Math.max(0, i + j))]!;
      s += x * k[j + r]!;
      w += k[j + r]!;
    }
    return s / w;
  });
}

/**
 * A virtual camera inside the source frame (result.video px): a window of
 * the target aspect, as big as fits, that pans along the free axis to keep
 * the action — or one player — in view. Smoothed per segment, speed-limited,
 * never leaves the frame.
 */
export function cameraPath(
  r: ResultLike,
  framing: Exclude<ClipFraming, { kind: "court" }>,
  segs: Segment[],
  format: ClipFormat,
): (t: number) => Rect {
  const W = r.video.width;
  const H = r.video.height;
  const aspect = ASPECT[format];
  const horizontal = W / H > aspect; // window moves along x
  const win = horizontal ? { w: H * aspect, h: H } : { w: W, h: W / aspect };
  const span = horizontal ? W - win.w : H - win.h;
  const centreOf = (b: [number, number, number, number]) => (horizontal ? (b[0] + b[2]) / 2 : (b[1] + b[3]) / 2);
  const live = r.shots.filter((s) => !s.deleted).sort((a, b) => a.t - b.t);
  const shotT = live.map((s) => s.t);
  const shuttleT = r.shuttle.map((s) => s.t); // samples are time-ordered

  const target = (t: number): number | null => {
    if (framing.kind === "player") {
      const tr = r.tracks.find((x) => x.id === framing.id);
      const b = tr ? boxAt(tr, t) : null;
      return b ? centreOf(b) : null;
    }
    // Action: the shuttle while it's seen, pulled towards whoever hit last.
    let shuttle: number | null = null;
    let best = 0.25;
    for (let i = Math.max(0, lowerBound(shuttleT, t - 0.25)); i < shuttleT.length && shuttleT[i]! <= t + 0.25; i++) {
      const d = Math.abs(shuttleT[i]! - t);
      if (d < best) {
        best = d;
        shuttle = horizontal ? r.shuttle[i]!.x : r.shuttle[i]!.y;
      }
    }
    let hitter: number | null = null;
    const last = live[lowerBound(shotT, t + 1e-9) - 1];
    if (last && t - last.t <= 3 && last.hitter) {
      const tr = r.tracks.find((x) => x.id === last.hitter);
      const b = tr ? boxAt(tr, t) : null;
      hitter = b ? centreOf(b) : null;
    }
    if (shuttle !== null && hitter !== null) return 0.6 * shuttle + 0.4 * hitter;
    if (shuttle !== null) return shuttle;
    if (hitter !== null) return hitter;
    const all = r.tracks.map((tr) => boxAt(tr, t)).filter((b): b is [number, number, number, number] => !!b);
    return all.length ? all.reduce((a, b) => a + centreOf(b), 0) / all.length : null;
  };

  const tracks = segs.map((seg) => {
    const n = Math.max(1, Math.ceil((seg.end - seg.start) * CAMERA_HZ) + 1);
    const raw: (number | null)[] = Array.from({ length: n }, (_, i) => target(seg.start + i / CAMERA_HZ));
    // Hold the last known target through gaps (first known one at the start).
    const first = raw.find((v) => v !== null) ?? (horizontal ? W / 2 : H / 2);
    let held = first;
    const filled = raw.map((v) => (held = v ?? held));
    const smooth = gaussianSmooth(filled, CAMERA_SIGMA * CAMERA_HZ);
    const maxStep = (MAX_PAN * (horizontal ? win.w : win.h)) / CAMERA_HZ;
    const pos: number[] = [];
    for (let i = 0; i < smooth.length; i++) {
      const want = Math.min(span, Math.max(0, smooth[i]! - (horizontal ? win.w : win.h) / 2));
      const prev = pos[i - 1];
      pos.push(prev === undefined ? want : prev + Math.max(-maxStep, Math.min(maxStep, want - prev)));
    }
    return { seg, pos };
  });

  return (t: number) => {
    const tr = tracks.find((x) => t >= x.seg.start - 0.05 && t <= x.seg.end + 0.05) ?? tracks[0];
    let p = span / 2;
    if (tr) {
      const f = Math.max(0, Math.min(tr.pos.length - 1, (t - tr.seg.start) * CAMERA_HZ));
      const i = Math.floor(f);
      const a = tr.pos[i]!;
      const b = tr.pos[Math.min(tr.pos.length - 1, i + 1)]!;
      p = a + (b - a) * (f - i);
    }
    return horizontal ? { x: p, y: 0, w: win.w, h: win.h } : { x: 0, y: p, w: win.w, h: win.h };
  };
}

/** "Rally 2 · 0:41–0:58" style timestamps (m:ss). */
export function clock(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Shot timestamp with tenths: "0:07.6". */
export function stamp(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const tenths = Math.round(s * 10);
  const m = Math.floor(tenths / 600);
  const rest = tenths - m * 600;
  return `${m}:${String(Math.floor(rest / 10)).padStart(2, "0")}.${rest % 10}`;
}
