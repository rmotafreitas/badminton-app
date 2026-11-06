/**
 * Offline player tracker in court coordinates.
 *
 * Works on the whole session's detections at once (analysis is offline), so
 * it can infer how many people play on each half before labelling:
 *   1. keep detections whose feet map onto the court (spectators, coaches on
 *      the bench and neighbouring courts drop out here);
 *   2. infer players per half → singles / doubles / practice;
 *   3. keep one slot per expected player, P1/P2… on the near half, then the
 *      far half, left→right; associate detections to slots each frame with an
 *      alpha–beta filter so brief occlusions don't lose identities.
 */
import { COURT, insideCourt } from "../geometry/court";
import type { Vec2 } from "../geometry/linalg";
import type { PlayerId, PlayerInfo, PlayerTrack, SessionFormat } from "../types";
import { TRACK_HZ } from "../types";

export interface Detection {
  /** Image box (px). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
}

export interface FrameDetections {
  t: number;
  boxes: Detection[];
}

export interface TrackerOptions {
  /** Image px → court floor (m). Null when the point maps to infinity. */
  toCourt: (p: Vec2) => Vec2 | null;
  /** Force a format instead of inferring it. */
  format?: SessionFormat;
  /** Max people per half we will track. */
  maxPerSide?: number;
  /**
   * Estimated real height (m) of the person in a box, from the calibrated
   * camera. Seated spectators (~1.1 m), bags and kids drop out.
   */
  heightOf?: (box: Detection, court: Vec2) => number | null;
}

export interface TrackerResult {
  format: SessionFormat;
  players: PlayerInfo[];
  tracks: PlayerTrack[];
}

const IDS: PlayerId[] = ["P1", "P2", "P3", "P4", "P5", "P6"];
const GATE_M = 2.2;

interface Candidate {
  box: Detection;
  court: Vec2;
}

function feet(b: Detection): Vec2 {
  return { x: (b.x1 + b.x2) / 2, y: b.y2 };
}

function candidates(
  frame: FrameDetections,
  toCourt: TrackerOptions["toCourt"],
  heightOf?: TrackerOptions["heightOf"],
): Candidate[] {
  const out: Candidate[] = [];
  for (const box of frame.boxes) {
    const court = toCourt(feet(box));
    if (!court) continue;
    if (heightOf) {
      const hM = heightOf(box, court);
      // Players measure ~1.25–2.5 m (lunging … raised racket arm); seated
      // people ~0.7–0.9 m. Boxes cut
      // by the frame edge are allowed through (null).
      if (hM !== null && (hM < 1.0 || hM > 2.8)) continue;
    }
    // Players step a little outside the lines; behind the baseline more so.
    if (Math.abs(court.x) > 3.05 + 1.2 || Math.abs(court.y) > 6.7 + 2) continue;
    if (!insideCourt(court, "doubles", 2)) continue;
    // Duplicate boxes for the same person (feet within 40 cm): keep the best.
    const dup = out.findIndex((c) => Math.hypot(c.court.x - court.x, c.court.y - court.y) < 0.4);
    if (dup >= 0) {
      if (out[dup]!.box.score < box.score) out[dup] = { box, court };
      continue;
    }
    out.push({ box, court });
  }
  return out;
}

/**
 * People on a half: the largest k seen in at least `frac` of frames.
 * (The mode under-counts: partners occlude each other and far players are
 * often missed, but a person who isn't there is never detected for long.)
 */
function sustainedCount(counts: number[], max: number, frac = 0.3): number {
  if (!counts.length) return 0;
  for (let k = max; k >= 1; k--) {
    if (counts.filter((c) => c >= k).length >= frac * counts.length) return k;
  }
  return 0;
}

export function inferFormat(near: number, far: number): SessionFormat {
  if (near === 1 && far === 1) return "singles";
  if (near === 2 && far === 2) return "doubles";
  return "practice";
}

interface Slot {
  id: PlayerId;
  side: -1 | 1;
  pos: Vec2;
  vel: Vec2;
  lastSeen: number;
  initialised: boolean;
}

/** All permutations assigning ≤ slots.length candidates (small n: ≤ 3 per side). */
function bestAssignment(
  slots: Slot[],
  cands: Candidate[],
  predict: (s: Slot) => Vec2,
  gate: (s: Slot) => number,
) {
  let best: { cost: number; map: (number | -1)[] } = {
    cost: Infinity,
    map: slots.map(() => -1),
  };
  const used = new Array<boolean>(cands.length).fill(false);
  const map: (number | -1)[] = [];
  const rec = (i: number, cost: number) => {
    if (cost >= best.cost) return;
    if (i === slots.length) {
      best = { cost, map: [...map] };
      return;
    }
    const p = predict(slots[i]!);
    // Option: leave slot unmatched. The penalty equals the slot's gate so any
    // candidate it could accept is preferred (stale slots have wide gates).
    map.push(-1);
    rec(i + 1, cost + (slots[i]!.initialised ? gate(slots[i]!) : GATE_M));
    map.pop();
    for (let j = 0; j < cands.length; j++) {
      if (used[j]) continue;
      const d = Math.hypot(cands[j]!.court.x - p.x, cands[j]!.court.y - p.y);
      if (slots[i]!.initialised && d > gate(slots[i]!)) continue;
      used[j] = true;
      map.push(j);
      rec(i + 1, cost + (slots[i]!.initialised ? d : 0));
      map.pop();
      used[j] = false;
    }
  };
  rec(0, 0);
  return best.map;
}

/**
 * Spots occupied for most of the session at the edge of (or outside) the
 * court: benches, chairs, people sitting behind a baseline. Players move;
 * a coach feeding from mid-court isn't at the edge, so isn't excluded.
 */
interface Tracklet {
  pts: Vec2[];
  last: Vec2;
  lastIdx: number;
}

/** Greedy short-range linking of candidates across frames (no identities). */
function tracklets(perFrame: { cands: Candidate[] }[], radius = 0.9): Tracklet[] {
  const all: Tracklet[] = [];
  let active: Tracklet[] = [];
  perFrame.forEach((f, idx) => {
    const used = new Set<Tracklet>();
    for (const c of f.cands) {
      let best: Tracklet | null = null;
      let bd = radius;
      for (const t of active) {
        if (used.has(t)) continue;
        const d = Math.hypot(t.last.x - c.court.x, t.last.y - c.court.y);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (!best) {
        best = { pts: [], last: c.court, lastIdx: idx };
        all.push(best);
      }
      best.pts.push(c.court);
      best.last = c.court;
      best.lastIdx = idx;
      used.add(best);
    }
    active = all.filter((t) => idx - t.lastIdx <= 10);
  });
  return all;
}

function spread(pts: Vec2[]): number {
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return Math.sqrt(pts.reduce((a, p) => a + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / pts.length);
}

/**
 * Spectators: people who barely move for most of the session near the court
 * edges (sitting on a bench, waiting behind a baseline), plus long-occupied
 * spots at the edge. Their detections are ignored.
 */
export function stationaryZones(perFrame: { cands: Candidate[] }[]): Vec2[] {
  const n = perFrame.length;
  const zones: Vec2[] = [];
  if (n >= 20) {
    for (const t of tracklets(perFrame)) {
      if (t.pts.length < 0.5 * n || spread(t.pts) > 0.25) continue;
      const mx = t.pts.reduce((a, p) => a + p.x, 0) / t.pts.length;
      const my = t.pts.reduce((a, p) => a + p.y, 0) / t.pts.length;
      // Only near the edges: a still feeder or a waiting player mid-court
      // is a participant.
      if (Math.abs(mx) > COURT.halfDoublesWidth - 1 || Math.abs(my) > COURT.halfLength - 1.5) {
        zones.push({ x: mx, y: my });
      }
    }
  }
  return [...zones, ...edgeZones(perFrame)];
}

function edgeZones(perFrame: { cands: Candidate[] }[]): Vec2[] {
  const cell = 0.4;
  const counts = new Map<string, number>();
  const key = (x: number, y: number) => `${x}:${y}`;
  for (const f of perFrame) {
    const seen = new Set<string>();
    for (const c of f.cands) {
      const k = key(Math.round(c.court.x / cell), Math.round(c.court.y / cell));
      if (seen.has(k)) continue;
      seen.add(k);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const n = perFrame.length;
  const zones: Vec2[] = [];
  for (const k of counts.keys()) {
    const [cx, cy] = k.split(":").map(Number) as [number, number];
    let sum = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) sum += counts.get(key(cx + dx, cy + dy)) ?? 0;
    const p = { x: cx * cell, y: cy * cell };
    const atEdge = Math.abs(p.x) > COURT.halfDoublesWidth - 1 || Math.abs(p.y) > COURT.halfLength - 1;
    if (atEdge && sum > 0.5 * n && n >= 20) {
      if (zones.every((z) => Math.hypot(z.x - p.x, z.y - p.y) > 0.8)) zones.push(p);
    }
  }
  return zones;
}

export function trackPlayers(frames: readonly FrameDetections[], opts: TrackerOptions): TrackerResult {
  const maxPerSide = opts.maxPerSide ?? 3;
  const raw = frames.map((f) => ({ t: f.t, cands: candidates(f, opts.toCourt, opts.heightOf) }));
  const zones = stationaryZones(raw);
  const perFrame = raw.map((f) => ({
    t: f.t,
    cands: f.cands.filter((c) => zones.every((z) => Math.hypot(z.x - c.court.x, z.y - c.court.y) > 0.7)),
  }));

  // Counting and initialisation use a strict margin: people sitting just
  // behind a baseline (coaches, waiting players) must not become players.
  const strict = (c: Candidate) => insideCourt(c.court, "doubles", 0.5);
  const nearCounts = perFrame.map((f) => f.cands.filter((c) => strict(c) && c.court.y < 0).length);
  const farCounts = perFrame.map((f) => f.cands.filter((c) => strict(c) && c.court.y >= 0).length);
  let near = sustainedCount(nearCounts, maxPerSide);
  let far = sustainedCount(farCounts, maxPerSide);
  const format = opts.format ?? inferFormat(near, far);
  if (format === "singles") [near, far] = [1, 1];
  if (format === "doubles") [near, far] = [2, 2];

  const slots: Slot[] = [];
  const makeSide = (side: -1 | 1, n: number) => {
    for (let i = 0; i < n; i++) {
      slots.push({
        id: IDS[slots.length]!,
        side,
        pos: { x: 0, y: side * 3 },
        vel: { x: 0, y: 0 },
        lastSeen: -Infinity,
        initialised: false,
      });
    }
  };
  makeSide(-1, near);
  makeSide(1, far);

  // Initialise each side's slots from the most active people in the first
  // ~10 s (long-lived and moving), sorted left → right as seen from the near
  // half. Robust to someone standing still on court for a moment.
  const early = perFrame.filter((f) => f.t - (perFrame[0]?.t ?? 0) <= 10);
  for (const side of [-1, 1] as const) {
    const sideSlots = slots.filter((s) => s.side === side);
    if (!sideSlots.length) continue;
    const onSide = early.map((f) => ({
      cands: f.cands.filter((c) => strict(c) && Math.sign(c.court.y || 1) === side),
    }));
    const ranked = tracklets(onSide)
      .filter((t) => t.pts.length >= 3)
      .map((t) => ({ t, score: t.pts.length * (0.2 + spread(t.pts)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, sideSlots.length)
      .map(({ t }) => t.pts[0]!)
      .sort((a, b) => a.x - b.x);
    if (ranked.length !== sideSlots.length) continue;
    sideSlots.forEach((s, i) => {
      s.pos = { ...ranked[i]! };
      s.lastSeen = perFrame[0]?.t ?? 0;
      s.initialised = true;
    });
  }

  const tStart = frames.length ? frames[0]!.t : 0;
  const tEnd = frames.length ? frames[frames.length - 1]!.t : 0;
  const nSamples = Math.max(0, Math.floor((tEnd - tStart) * TRACK_HZ) + 1);
  const tracks: PlayerTrack[] = slots.map((s) => ({
    id: s.id,
    t0: tStart,
    court: new Array<number>(nSamples * 2).fill(NaN),
    boxes: new Array<number>(nSamples * 4).fill(NaN),
  }));

  const ALPHA = 0.6;
  const BETA = 0.15;
  const MAX_SPEED = 8; // m/s — faster than any badminton footwork
  let prevT = -Infinity;
  for (const f of perFrame) {
    // First frame / duplicate timestamps: use the nominal interval so the
    // velocity update can't explode (r / 1 ms → hundreds of m/s).
    const dt = Number.isFinite(prevT) ? Math.min(1, Math.max(1 / 60, f.t - prevT)) : 1 / TRACK_HZ;
    prevT = f.t;
    const predict = (s: Slot): Vec2 => {
      // Velocity decays while unseen: people stop, they don't fly off.
      const stale = f.t - s.lastSeen;
      const k = stale > 0.5 ? 0.3 : 1;
      return { x: s.pos.x + s.vel.x * dt * k, y: s.pos.y + s.vel.y * dt * k };
    };
    for (const side of [-1, 1] as const) {
      const sideSlots = slots.filter((s) => s.side === side);
      if (!sideSlots.length) continue;
      // Allow small net-crossing tolerance (players reach over the net zone).
      const cands = f.cands.filter((c) => (side < 0 ? c.court.y < 0.5 : c.court.y >= -0.5));
      // A slot unseen for a while may have moved anywhere on its half:
      // widen its gate so it can be re-acquired after occlusion/misses.
      const gate = (s: Slot) => {
        const stale = f.t - s.lastSeen;
        return stale < 0.5 ? GATE_M : Math.min(6, GATE_M + 2 * stale);
      };
      const map = bestAssignment(sideSlots, cands, predict, gate);
      sideSlots.forEach((s, i) => {
        const p = predict(s);
        const j = map[i]!;
        if (j < 0) {
          // Coast, but bleed off velocity: people stop, they don't drift.
          s.pos = p;
          s.vel = { x: s.vel.x * 0.5, y: s.vel.y * 0.5 };
          return;
        }
        const z = cands[j]!.court;
        if (!s.initialised) {
          s.pos = { ...z };
          s.vel = { x: 0, y: 0 };
          s.initialised = true;
        } else {
          const rx = z.x - p.x;
          const ry = z.y - p.y;
          s.pos = { x: p.x + ALPHA * rx, y: p.y + ALPHA * ry };
          const vx = s.vel.x + (BETA * rx) / dt;
          const vy = s.vel.y + (BETA * ry) / dt;
          const sp = Math.hypot(vx, vy);
          s.vel = sp > MAX_SPEED ? { x: (vx / sp) * MAX_SPEED, y: (vy / sp) * MAX_SPEED } : { x: vx, y: vy };
        }
        s.lastSeen = f.t;
        const k = Math.round((f.t - tStart) * TRACK_HZ);
        const tr = tracks[slots.indexOf(s)]!;
        if (k >= 0 && k < nSamples) {
          tr.court[k * 2] = s.pos.x;
          tr.court[k * 2 + 1] = s.pos.y;
          const b = cands[j]!.box;
          tr.boxes.splice(k * 4, 4, b.x1, b.y1, b.x2, b.y2);
        }
      });
    }
  }

  // Fill short gaps (≤ 1.5 s) by linear interpolation so occlusions don't
  // break distance or the overlay.
  for (const tr of tracks) fillGaps(tr, Math.round(1.5 * TRACK_HZ));

  return {
    format,
    players: slots.map((s) => ({ id: s.id, side: s.side })),
    tracks,
  };
}

function fillGaps(tr: PlayerTrack, maxGap: number) {
  const n = tr.court.length / 2;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(tr.court[i * 2]!)) continue;
    if (last >= 0 && i - last > 1 && i - last <= maxGap) {
      for (let k = last + 1; k < i; k++) {
        const a = (k - last) / (i - last);
        for (const [arr, w] of [[tr.court, 2], [tr.boxes, 4]] as const) {
          for (let c = 0; c < w; c++) {
            arr[k * w + c] = arr[last * w + c]! + a * (arr[i * w + c]! - arr[last * w + c]!);
          }
        }
      }
    }
    last = i;
  }
}

/**
 * Position jitter of a 10 Hz track (m): robust std of second differences,
 * which cancel smooth motion and keep measurement noise (σ·√6 for white noise).
 */
export function trackJitter(tr: PlayerTrack): number {
  const n = tr.court.length / 2;
  const d: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const xs = [tr.court[(i - 1) * 2]!, tr.court[i * 2]!, tr.court[(i + 1) * 2]!];
    const ys = [tr.court[(i - 1) * 2 + 1]!, tr.court[i * 2 + 1]!, tr.court[(i + 1) * 2 + 1]!];
    if (xs.some(Number.isNaN)) continue;
    d.push(Math.hypot(xs[0]! - 2 * xs[1]! + xs[2]!, ys[0]! - 2 * ys[1]! + ys[2]!));
  }
  if (d.length < 10) return 0;
  d.sort((p, q) => p - q);
  return d[d.length >> 1]! / Math.sqrt(6);
}

/**
 * Smoothed 10 Hz positions. The window adapts to the track's own jitter:
 * near players (precise feet) keep fast direction changes; far players,
 * whose depth is noisy from a low camera, get more smoothing so jitter
 * isn't counted as running.
 */
export function smoothTrack(tr: PlayerTrack): (Vec2 | null)[] {
  const n = tr.court.length / 2;
  const jitter = trackJitter(tr);
  const half = jitter < 0.04 ? 1 : jitter < 0.1 ? 2 : jitter < 0.2 ? 3 : 4;
  const out: (Vec2 | null)[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(tr.court[i * 2]!)) {
      out.push(null);
      continue;
    }
    let sx = 0;
    let sy = 0;
    let c = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(n - 1, i + half); k++) {
      const x = tr.court[k * 2]!;
      if (Number.isNaN(x)) continue;
      sx += x;
      sy += tr.court[k * 2 + 1]!;
      c++;
    }
    out.push({ x: sx / c, y: sy / c });
  }
  return out;
}

/** Path length of a smoothed track; ignores sub-2 cm steps and > 12 m/s glitches. */
export function pathLength(smooth: readonly (Vec2 | null)[], upTo = smooth.length): number[] {
  const cum = new Array<number>(Math.min(upTo, smooth.length)).fill(0);
  let d = 0;
  for (let i = 1; i < cum.length; i++) {
    const a = smooth[i - 1];
    const b = smooth[i];
    if (a && b) {
      const step = Math.hypot(b.x - a.x, b.y - a.y);
      if (step > 0.02 && step < 1.2) d += step;
    }
    cum[i] = d;
  }
  return cum;
}

/** Distance covered (m) from a 10 Hz court track. */
export function distanceCovered(tr: PlayerTrack): number {
  const cum = pathLength(smoothTrack(tr));
  return cum.length ? cum[cum.length - 1]! : 0;
}

/** Court position of a player at time t (linear interpolation), or null. */
export function positionAt(tr: PlayerTrack, t: number): Vec2 | null {
  const f = (t - tr.t0) * TRACK_HZ;
  const i = Math.floor(f);
  const n = tr.court.length / 2;
  if (i < 0 || i >= n) return null;
  const a = { x: tr.court[i * 2]!, y: tr.court[i * 2 + 1]! };
  if (Number.isNaN(a.x)) return null;
  if (i + 1 >= n || Number.isNaN(tr.court[(i + 1) * 2]!)) return a;
  const w = f - i;
  return { x: a.x + w * (tr.court[(i + 1) * 2]! - a.x), y: a.y + w * (tr.court[(i + 1) * 2 + 1]! - a.y) };
}

/** Image box of a player at time t (nearest sample), or null. */
export function boxAt(tr: PlayerTrack, t: number): [number, number, number, number] | null {
  const i = Math.round((t - tr.t0) * TRACK_HZ);
  if (i < 0 || i * 4 >= tr.boxes.length || Number.isNaN(tr.boxes[i * 4]!)) return null;
  return [tr.boxes[i * 4]!, tr.boxes[i * 4 + 1]!, tr.boxes[i * 4 + 2]!, tr.boxes[i * 4 + 3]!];
}
