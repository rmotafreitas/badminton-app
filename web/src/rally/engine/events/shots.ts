/**
 * Hit detection, rally segmentation, per-shot physics and shot typing.
 *
 * Hits are abrupt velocity changes of the shuttle's image track that happen
 * next to a player. A high clear's apex also "turns around" in the image when
 * filmed from behind the baseline, but it turns gradually (gravity + drag)
 * and far above the players' boxes — both checks reject it.
 */
import type { Camera } from "../geometry/camera";
import type { Vec2 } from "../geometry/linalg";
import { fitFlight, type FlightFit, type Observation } from "../physics/shuttle-flight";
import { boxAt, positionAt } from "../tracking/player-tracker";
import type {
  Confidence,
  PlayerId,
  PlayerTrack,
  Rally,
  Shot,
  ShotType,
  ShuttleSample,
} from "../types";

export interface HitCandidate {
  t: number;
  index: number;
  /** 0–1, how abrupt the velocity change is. */
  sharpness: number;
  hitter: PlayerId | null;
  /** Every player within reach, best first (resolved by side alternation). */
  reach: PlayerId[];
  /** Shuttle height relative to each in-reach player's box (0 feet … 1 box top). */
  heights: Partial<Record<PlayerId, number>>;
}

/** Velocity (px/s) by least squares over samples [from, to] (inclusive). */
function velocity(track: readonly ShuttleSample[], from: number, to: number): Vec2 | null {
  const pts = track.slice(Math.max(0, from), Math.min(track.length, to + 1));
  if (pts.length < 2) return null;
  const tm = pts.reduce((s, p) => s + p.t, 0) / pts.length;
  const xm = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const ym = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let stt = 0;
  let stx = 0;
  let sty = 0;
  for (const p of pts) {
    stt += (p.t - tm) ** 2;
    stx += (p.t - tm) * (p.x - xm);
    sty += (p.t - tm) * (p.y - ym);
  }
  if (stt < 1e-9) return null;
  return { x: stx / stt, y: sty / stt };
}

function playersInReach(
  tracks: readonly PlayerTrack[],
  t: number,
  p: Vec2,
): { reach: PlayerId[]; heights: Partial<Record<PlayerId, number>> } {
  const hits: { id: PlayerId; d: number }[] = [];
  const heights: Partial<Record<PlayerId, number>> = {};
  for (const tr of tracks) {
    const b = boxAt(tr, t);
    if (!b) continue;
    const [x1, y1, x2, y2] = b;
    const w = x2 - x1;
    const h = y2 - y1;
    // Reach: an arm + racket to the sides, and above the head up to 0.6 of a
    // body height (the detector's box usually includes a raised arm). A
    // flight apex seen from behind the baseline sits well above that.
    const inside = p.x >= x1 - 0.7 * w && p.x <= x2 + 0.7 * w && p.y >= y1 - 0.6 * h && p.y <= y2;
    if (!inside) continue;
    heights[tr.id as PlayerId] = (y2 - p.y) / Math.max(1, h);
    const d = Math.hypot(p.x - (x1 + x2) / 2, p.y - y1) / Math.max(1, h);
    hits.push({ id: tr.id as PlayerId, d });
  }
  return { reach: hits.sort((a, b) => a.d - b.d).map((h) => h.id), heights };
}

export interface DetectOptions {
  fps: number;
  /** Image diagonal (px); sets the minimum shuttle speed for a hit. */
  diagonal?: number;
  /** Player → court half, for the alternation rule. */
  sides?: Partial<Record<PlayerId, -1 | 1>>;
  /** Frames of context on each side for one-sided velocities. */
  window?: number;
  minSharpness?: number;
  /** Minimum time between two hits (s). */
  refractory?: number;
}

export function detectHits(
  track: readonly ShuttleSample[],
  tracks: readonly PlayerTrack[],
  opts: DetectOptions,
): HitCandidate[] {
  const win = opts.window ?? Math.max(3, Math.round(opts.fps / 10));
  const minSharp = opts.minSharpness ?? 0.55;
  const refractory = opts.refractory ?? 0.3;
  // Jitter floor: ~0.08 image diagonals per second (≈ 120 px/s at 720p);
  // far-court shots move few pixels, static blobs are removed upstream.
  const minSpeed = 0.08 * (opts.diagonal ?? 1468);
  const maxDt = (win + 2) / opts.fps;
  const cands: HitCandidate[] = [];
  // Serves (and any shot after a detection gap): the shuttle starts moving
  // next to a player. There is no "before" velocity to compare with.
  for (let i = 0; i < track.length; i++) {
    const startsSegment = i === 0 || track[i]!.t - track[i - 1]!.t > 0.5;
    if (!startsSegment) continue;
    const ahead = track.slice(i, i + win + 1);
    if (ahead.length < win || ahead[ahead.length - 1]!.t - track[i]!.t > maxDt) continue;
    const { reach, heights } = playersInReach(tracks, track[i]!.t, track[i]!);
    if (reach.length) cands.push({ t: track[i]!.t, index: i, sharpness: 0.9, hitter: reach[0]!, reach, heights });
  }
  for (let i = 1; i < track.length - 1; i++) {
    // Both windows must be temporally contiguous.
    const lo = i - win;
    const hi = i + win;
    if (lo < 0 || hi >= track.length) continue;
    if (track[i]!.t - track[lo]!.t > maxDt || track[hi]!.t - track[i]!.t > maxDt) continue;
    const vb = velocity(track, lo, i);
    const va = velocity(track, i, hi);
    if (!vb || !va) continue;
    const nb = Math.hypot(vb.x, vb.y);
    const na = Math.hypot(va.x, va.y);
    if (nb + na < 1e-6) continue;
    // A hit sends the shuttle somewhere: pixel jitter of a static false
    // positive has huge relative direction changes but no real speed.
    if (Math.max(na, nb) < minSpeed) continue;
    const sharpness = Math.hypot(va.x - vb.x, va.y - vb.y) / (nb + na);
    if (sharpness < minSharp) continue;
    const { reach, heights } = playersInReach(tracks, track[i]!.t, track[i]!);
    if (!reach.length) continue;
    cands.push({ t: track[i]!.t, index: i, sharpness, hitter: reach[0]!, reach, heights });
  }
  // Non-maximum suppression in time.
  cands.sort((a, b) => b.sharpness - a.sharpness);
  const kept: HitCandidate[] = [];
  for (const c of cands) {
    if (kept.every((k) => Math.abs(k.t - c.t) >= refractory)) kept.push(c);
  }
  kept.sort((a, b) => a.t - b.t);
  // Shots alternate halves within a rally: resolve ambiguous reach (a near
  // player's big box overlapping a far player in the image) with that rule.
  if (opts.sides) {
    for (let k = 1; k < kept.length; k++) {
      const prev = kept[k - 1]!;
      const cur = kept[k]!;
      if (cur.t - prev.t > 3.5 || !prev.hitter) continue;
      const prevSide = opts.sides[prev.hitter];
      const opposite = cur.reach.find((id) => opts.sides![id] !== undefined && opts.sides![id] !== prevSide);
      if (opposite) cur.hitter = opposite;
    }
    // Two same-side contacts < 0.6 s apart are physically impossible (the
    // shuttle can't cross the net and come back that fast): one is a false
    // hit — usually a flight apex seen above a near player's head. Keep the
    // one where the shuttle is closer to the hitter's body.
    const sideOf = (h: HitCandidate) => (h.hitter ? opts.sides![h.hitter] : undefined);
    const bodyHeight = (h: HitCandidate) => (h.hitter ? (h.heights[h.hitter] ?? 1) : 1);
    for (let k = 1; k < kept.length; ) {
      const a = kept[k - 1]!;
      const b = kept[k]!;
      if (b.t - a.t < 0.6 && sideOf(a) !== undefined && sideOf(a) === sideOf(b)) {
        kept.splice(bodyHeight(a) <= bodyHeight(b) ? k : k - 1, 1);
        continue;
      }
      k++;
    }
  }
  return kept;
}

export function segmentRallies(hits: readonly HitCandidate[], maxGap = 3.5): HitCandidate[][] {
  const out: HitCandidate[][] = [];
  let cur: HitCandidate[] = [];
  for (const h of hits) {
    if (cur.length && h.t - cur[cur.length - 1]!.t > maxGap) {
      out.push(cur);
      cur = [];
    }
    cur.push(h);
  }
  if (cur.length) out.push(cur);
  return out;
}

// ── Classification ─────────────────────────────────────────────────────────

/**
 * Fallback when there is no trustworthy physics fit: flight time to the next
 * contact plus where hitter and receiver stand. Always low confidence — it
 * gives the review list a sensible starting point instead of "other".
 */
export function classifyFromContext(f: {
  first: boolean;
  flightTime: number | null;
  hitterY: number | null;
  receiverY: number | null;
}): ShotType {
  if (f.first) return "serve";
  if (f.flightTime === null || f.hitterY === null) return "other";
  const hitterDepth = Math.abs(f.hitterY);
  const receiverDepth = f.receiverY === null ? null : Math.abs(f.receiverY);
  if (f.flightTime >= 1.15) return hitterDepth >= 4 ? "clear" : "lift";
  if (hitterDepth <= 2.6 && receiverDepth !== null && receiverDepth <= 2.8 && f.flightTime >= 0.5) return "net";
  if (hitterDepth >= 3.8 && f.flightTime < 0.75) return "smash";
  if (hitterDepth >= 3.8 && receiverDepth !== null && receiverDepth <= 3) return "drop";
  if (f.flightTime < 0.9) return "drive";
  return "other";
}

export type ContactHeight = "high" | "mid" | "low";

/**
 * Contact height from the image: where the shuttle is relative to the
 * hitter's body box at the moment of contact (same depth, so no 3D needed).
 * Overhead strokes meet the shuttle at/above the top of the box (raised
 * racket arm); underarm lifts and net shots well below the shoulders.
 */
export function contactHeight(
  shuttleY: number,
  box: readonly [number, number, number, number] | null,
): ContactHeight | null {
  if (!box) return null;
  const h = box[3] - box[1];
  if (h <= 0) return null;
  const r = (box[3] - shuttleY) / h;
  return r >= 0.85 ? "high" : r <= 0.5 ? "low" : "mid";
}

const CONTACT_PRIOR: Record<ContactHeight, { z: number; sigma: number }> = {
  high: { z: 2.5, sigma: 0.5 },
  mid: { z: 1.4, sigma: 0.5 },
  low: { z: 0.7, sigma: 0.4 },
};

export interface ShotCues {
  first: boolean;
  contact: ContactHeight | null;
  /** |y| of the hitter / next receiver (m from the net). */
  hitterDepth: number | null;
  receiverDepth: number | null;
  /** Seconds until the next contact (null for a rally's last shot). */
  flightTime: number | null;
  /** From a physically valid fit only. */
  fit: { vz: number; speedKmh: number; landingDepth: number | null; apex: number } | null;
}

/**
 * Shot type from robust cues first (contact height, flight time, where the
 * players stand), physics second. The two confusions people notice most:
 *   clear vs lift  → overhead vs underarm contact
 *   smash vs drop  → a drop is slower and lands short, a smash is fast
 */
export function classifyShot(c: ShotCues): { type: ShotType; confidence: Confidence } {
  if (c.first) return { type: "serve", confidence: "high" };
  const recv = c.receiverDepth ?? c.fit?.landingDepth ?? null;
  const ft = c.flightTime;
  const hitter = c.hitterDepth;
  const conf: Confidence = recv !== null && ft !== null ? "medium" : "low";

  if (c.contact === "high") {
    if (recv !== null && recv <= 2.6 && (ft === null || ft >= 0.5)) return { type: "drop", confidence: conf };
    if (ft !== null && ft < 0.75 && (!c.fit || c.fit.vz < 1)) {
      return { type: "smash", confidence: c.fit && c.fit.vz < -1 && c.fit.speedKmh >= 100 ? "high" : conf };
    }
    if (recv !== null && recv >= 4.3) return { type: "clear", confidence: conf };
    if (recv !== null && recv <= 3.2) return { type: "drop", confidence: conf };
    if (ft !== null) return ft >= 1.0 ? { type: "clear", confidence: "low" } : { type: "drop", confidence: "low" };
    if (c.fit) return c.fit.vz < -1 ? { type: "smash", confidence: "low" } : { type: "clear", confidence: "low" };
    return { type: "other", confidence: "low" };
  }

  if (c.contact === "mid") {
    if (hitter !== null && hitter <= 2.4 && recv !== null && recv <= 3) return { type: "net", confidence: conf };
    if (ft !== null && ft < 0.9) return { type: "drive", confidence: conf };
    if (recv !== null && recv >= 4.3) {
      return { type: hitter !== null && hitter >= 4 ? "clear" : "lift", confidence: conf };
    }
    return { type: "drive", confidence: "low" };
  }

  if (c.contact === "low") {
    if (hitter !== null && hitter <= 2.8 && recv !== null && recv <= 3) return { type: "net", confidence: conf };
    if ((recv !== null && recv >= 3.5) || (ft ?? 0) >= 1.0 || (c.fit?.apex ?? 0) >= 3) {
      return { type: "lift", confidence: conf };
    }
    if (hitter !== null && hitter <= 2.8) return { type: "net", confidence: "low" };
    return { type: "drive", confidence: "low" };
  }

  // No body box at contact: fall back to context only.
  return {
    type: classifyFromContext({
      first: false,
      flightTime: ft,
      hitterY: hitter,
      receiverY: c.receiverDepth,
    }),
    confidence: "low",
  };
}

// ── Assembly ───────────────────────────────────────────────────────────────

export interface BuildShotsInput {
  track: readonly ShuttleSample[];
  tracks: readonly PlayerTrack[];
  sides: Partial<Record<PlayerId, -1 | 1>>;
  camera: Camera | null;
  fps: number;
  /** Image diagonal (px). */
  diagonal?: number;
}

const CONTACT_Z = 2.0;

export function buildShots(input: BuildShotsInput): { rallies: Rally[]; shots: Shot[] } {
  const hits = detectHits(input.track, input.tracks, {
    fps: input.fps,
    sides: input.sides,
    diagonal: input.diagonal,
  });
  const rallies: Rally[] = [];
  const shots: Shot[] = [];
  const trackOf = (id: PlayerId | null) => input.tracks.find((t) => t.id === id);

  const contactOf = (h: HitCandidate): ContactHeight | null => {
    const tr = trackOf(h.hitter);
    const sample = input.track[h.index];
    return tr && sample ? contactHeight(sample.y, boxAt(tr, h.t)) : null;
  };

  segmentRallies(hits).forEach((rallyHits, ri) => {
    const rallyId = `r${ri + 1}`;
    const ids: string[] = [];
    rallyHits.forEach((h, k) => {
      const contact = contactOf(h);
      const prior = contact ? CONTACT_PRIOR[contact] : { z: CONTACT_Z, sigma: 0.8 };
      const next = rallyHits[k + 1];
      const tEnd = next ? next.t : h.t + 2.5;
      const obs: Observation[] = input.track
        .filter((s) => s.t > h.t + 0.5 / input.fps && s.t < tEnd - 1.5 / input.fps)
        .map((s) => ({ t: s.t - h.t, px: { x: s.x, y: s.y } }));
      const hitterPos = positionAt(trackOf(h.hitter) ?? input.tracks[0]!, h.t);
      const side = (h.hitter && input.sides[h.hitter]) ?? (hitterPos ? (hitterPos.y < 0 ? -1 : 1) : -1);
      const receiverPos = next?.hitter ? positionAt(trackOf(next.hitter)!, next.t) : null;
      const nextContact = next ? contactOf(next) : null;
      const endPrior = nextContact ? CONTACT_PRIOR[nextContact] : { z: CONTACT_Z, sigma: 0.9 };

      let fit: FlightFit | null = null;
      if (input.camera && hitterPos && obs.length >= 4) {
        fit = fitFlight(input.camera, obs, {
          p: [hitterPos.x, hitterPos.y, prior.z],
          sigma: [0.6, 0.6, prior.sigma],
          towardsY: side === -1 ? 1 : -1,
          end: receiverPos
            ? {
                t: next!.t - h.t,
                p: [receiverPos.x, receiverPos.y, endPrior.z],
                sigma: [0.6, 0.6, endPrior.sigma],
              }
            : undefined,
        });
      }

      // Average speed between contacts uses the 3D contact points.
      let avgSpeedKmh: number | null = null;
      if (fit && receiverPos && next) {
        const [ex, ey] = [receiverPos.x, receiverPos.y];
        const d = Math.hypot(ex - fit.start.p[0], ey - fit.start.p[1], endPrior.z - fit.start.p[2]);
        avgSpeedKmh = Math.round((d / (next.t - h.t)) * 3.6);
      }

      // Physically valid fits only: contact between knee-ish and a jump
      // smash's reach, human launch speeds, and pixels explained.
      const goodFit =
        !!fit &&
        fit.rmsPx < 6 &&
        fit.start.p[2] >= 0.2 &&
        fit.start.p[2] <= 3.6 &&
        fit.speed * 3.6 <= 420;
      const speedConfidence: Confidence = !goodFit
        ? "low"
        : receiverPos && obs.length >= 6
          ? "high"
          : obs.length >= 15
            ? "medium"
            : "low";
      const { type, confidence } = classifyShot({
        first: k === 0,
        contact,
        hitterDepth: hitterPos ? Math.abs(hitterPos.y) : null,
        receiverDepth: receiverPos ? Math.abs(receiverPos.y) : null,
        flightTime: next ? next.t - h.t : null,
        fit: goodFit
          ? {
              vz: fit!.start.v[2],
              speedKmh: fit!.speed * 3.6,
              landingDepth: fit!.summary.landing ? Math.abs(fit!.summary.landing.y) : null,
              apex: fit!.summary.apexHeight,
            }
          : null,
      });

      const id = `${rallyId}s${k + 1}`;
      ids.push(id);
      shots.push({
        id,
        rallyId,
        t: h.t,
        hitter: h.hitter,
        type,
        typeConfidence: confidence,
        speedKmh: goodFit ? Math.round(fit!.speed * 3.6) : null,
        avgSpeedKmh,
        speedConfidence,
        contactHeight: goodFit ? round2(fit!.start.p[2]) : null,
        apexHeight: goodFit ? round2(fit!.summary.apexHeight) : null,
        flightTime: goodFit ? round2(fit!.summary.flightTime) : null,
        landing: goodFit && fit!.summary.landing
          ? { x: round2(fit!.summary.landing.x), y: round2(fit!.summary.landing.y) }
          : null,
      });
    });
    rallies.push({
      id: rallyId,
      start: rallyHits[0]!.t,
      end: rallyHits[rallyHits.length - 1]!.t + 1.5,
      shotIds: ids,
    });
  });
  return { rallies, shots };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

