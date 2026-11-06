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
import { insideCourt } from "../geometry/court";
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

function candidates(frame: FrameDetections, toCourt: TrackerOptions["toCourt"]): Candidate[] {
  const out: Candidate[] = [];
  for (const box of frame.boxes) {
    const court = toCourt(feet(box));
    if (!court) continue;
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

/** Most common per-frame count of people on a half (ignoring empty frames). */
function modeCount(counts: number[], max: number): number {
  const hist = new Array<number>(max + 1).fill(0);
  for (const c of counts) hist[Math.min(c, max)]!++;
  hist[0] = 0;
  let best = 0;
  for (let i = 1; i <= max; i++) if (hist[i]! > hist[best]!) best = i;
  return best;
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
function bestAssignment(slots: Slot[], cands: Candidate[], predict: (s: Slot) => Vec2) {
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
    // Option: leave slot unmatched (fixed penalty = gate).
    map.push(-1);
    rec(i + 1, cost + GATE_M);
    map.pop();
    for (let j = 0; j < cands.length; j++) {
      if (used[j]) continue;
      const d = Math.hypot(cands[j]!.court.x - p.x, cands[j]!.court.y - p.y);
      if (slots[i]!.initialised && d > GATE_M) continue;
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

export function trackPlayers(frames: readonly FrameDetections[], opts: TrackerOptions): TrackerResult {
  const maxPerSide = opts.maxPerSide ?? 3;
  const perFrame = frames.map((f) => ({ t: f.t, cands: candidates(f, opts.toCourt) }));

  const nearCounts = perFrame.map((f) => f.cands.filter((c) => c.court.y < 0).length);
  const farCounts = perFrame.map((f) => f.cands.filter((c) => c.court.y >= 0).length);
  let near = modeCount(nearCounts, maxPerSide);
  let far = modeCount(farCounts, maxPerSide);
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

  // Initialise each side's slots from the first frame that shows exactly the
  // expected count there, sorted left → right (as seen from the near half).
  for (const side of [-1, 1] as const) {
    const sideSlots = slots.filter((s) => s.side === side);
    if (!sideSlots.length) continue;
    const first = perFrame.find(
      (f) => f.cands.filter((c) => Math.sign(c.court.y || 1) === side).length === sideSlots.length,
    );
    if (!first) continue;
    const cs = first.cands
      .filter((c) => Math.sign(c.court.y || 1) === side)
      .sort((a, b) => a.court.x - b.court.x);
    sideSlots.forEach((s, i) => {
      s.pos = { ...cs[i]!.court };
      s.lastSeen = first.t;
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
  let prevT = tStart;
  for (const f of perFrame) {
    const dt = Math.max(1e-3, f.t - prevT);
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
      const map = bestAssignment(sideSlots, cands, predict);
      sideSlots.forEach((s, i) => {
        const p = predict(s);
        const j = map[i]!;
        if (j < 0) {
          s.pos = p;
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
          s.vel = { x: s.vel.x + (BETA * rx) / dt, y: s.vel.y + (BETA * ry) / dt };
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
 * Distance covered (m) from a 10 Hz court track: centred moving average over
 * 0.3 s to remove detection jitter, then path length ignoring sub-2 cm steps.
 * (Wider windows cut corners on direction changes and under-count lunges.)
 */
export function distanceCovered(tr: PlayerTrack): number {
  const n = tr.court.length / 2;
  const half = 1;
  const smooth: (Vec2 | null)[] = [];
  for (let i = 0; i < n; i++) {
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
    smooth.push(c && !Number.isNaN(tr.court[i * 2]!) ? { x: sx / c, y: sy / c } : null);
  }
  let d = 0;
  for (let i = 1; i < n; i++) {
    const a = smooth[i - 1];
    const b = smooth[i];
    if (!a || !b) continue;
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    if (step > 0.02 && step < 1.2) d += step; // > 12 m/s is a tracking glitch
  }
  return d;
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
