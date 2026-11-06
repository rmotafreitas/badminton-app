/**
 * Shuttlecock flight model + monocular trajectory fit.
 *
 * A shuttle is dominated by quadratic drag: a = g − (g / v_t²)·|v|·v with a
 * terminal velocity v_t ≈ 6.7 m/s, so a smash leaving the racket at 90 m/s
 * is under 30 m/s by the time it lands. That strong, known deceleration is
 * what makes a single camera usable: given the hitter's position (from the
 * player tracker) and the shuttle's 2D image track for the first frames after
 * contact, only one 3D launch (p₀, v₀) explains the observed curve.
 *
 * This mirrors the idea behind multi-camera systems such as Hawk-Eye, which
 * fit a physical model to observations, but with one camera the result is an
 * estimate: we report a residual so the UI can mark low-confidence shots.
 */
import { project, type Camera } from "../geometry/camera";
import { solve, type Vec2, type Vec3 } from "../geometry/linalg";

export const GRAVITY = 9.81;
/** Terminal velocity of a feather/nylon shuttle (m/s). */
export const TERMINAL_VELOCITY = 6.7;
const K_DRAG = GRAVITY / (TERMINAL_VELOCITY * TERMINAL_VELOCITY);
const DT = 1 / 240;

export interface FlightState {
  p: Vec3;
  v: Vec3;
}

function accel(v: Vec3): Vec3 {
  const s = Math.hypot(v[0], v[1], v[2]);
  return [-K_DRAG * s * v[0], -K_DRAG * s * v[1], -GRAVITY - K_DRAG * s * v[2]];
}

/** One RK4 step of the flight ODE. */
function step(st: FlightState, dt: number): FlightState {
  const { p, v } = st;
  const a1 = accel(v);
  const v2: Vec3 = [v[0] + (a1[0] * dt) / 2, v[1] + (a1[1] * dt) / 2, v[2] + (a1[2] * dt) / 2];
  const a2 = accel(v2);
  const v3: Vec3 = [v[0] + (a2[0] * dt) / 2, v[1] + (a2[1] * dt) / 2, v[2] + (a2[2] * dt) / 2];
  const a3 = accel(v3);
  const v4: Vec3 = [v[0] + a3[0] * dt, v[1] + a3[1] * dt, v[2] + a3[2] * dt];
  const a4 = accel(v4);
  return {
    p: [
      p[0] + (dt / 6) * (v[0] + 2 * v2[0] + 2 * v3[0] + v4[0]),
      p[1] + (dt / 6) * (v[1] + 2 * v2[1] + 2 * v3[1] + v4[1]),
      p[2] + (dt / 6) * (v[2] + 2 * v2[2] + 2 * v3[2] + v4[2]),
    ],
    v: [
      v[0] + (dt / 6) * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]),
      v[1] + (dt / 6) * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]),
      v[2] + (dt / 6) * (a1[2] + 2 * a2[2] + 2 * a3[2] + a4[2]),
    ],
  };
}

/** Positions at the requested times (seconds after launch, ascending). */
export function simulate(start: FlightState, times: readonly number[]): Vec3[] {
  const out: Vec3[] = [];
  let st = start;
  let t = 0;
  for (const target of times) {
    while (t + DT <= target) {
      st = step(st, DT);
      t += DT;
    }
    const rem = target - t;
    out.push(rem > 1e-9 ? step(st, rem).p : st.p);
  }
  return out;
}

export interface FlightSummary {
  /** Time until the shuttle reaches the floor (or maxT). */
  flightTime: number;
  landing: Vec2 | null;
  apexHeight: number;
  /** Speed at landing (or at maxT). */
  endSpeed: number;
}

/** Integrates until the shuttle hits the floor (z = 0). */
export function summarise(start: FlightState, maxT = 5): FlightSummary {
  let st = start;
  let t = 0;
  let apex = st.p[2];
  while (t < maxT) {
    const next = step(st, DT);
    if (next.p[2] <= 0) {
      // Linear interpolation of the floor crossing.
      const a = st.p[2] / (st.p[2] - next.p[2]);
      const landing = {
        x: st.p[0] + a * (next.p[0] - st.p[0]),
        y: st.p[1] + a * (next.p[1] - st.p[1]),
      };
      return {
        flightTime: t + a * DT,
        landing,
        apexHeight: apex,
        endSpeed: Math.hypot(...next.v),
      };
    }
    st = next;
    t += DT;
    apex = Math.max(apex, st.p[2]);
  }
  return { flightTime: maxT, landing: null, apexHeight: apex, endSpeed: Math.hypot(...st.v) };
}

// ── Monocular fit ───────────────────────────────────────────────────────────

export interface Observation {
  /** Seconds since the hit. */
  t: number;
  /** Shuttle position in image pixels. */
  px: Vec2;
}

export interface LaunchPrior {
  /** Expected contact point (world, m): hitter's floor position + racket height. */
  p: Vec3;
  /** Standard deviation of the prior, metres. */
  sigma: Vec3;
  /** Direction the shot is expected to go (+1: towards +y, −1: towards −y). */
  towardsY: 1 | -1;
  /**
   * Where the shuttle was next touched (receiver's contact point), if known.
   * By far the strongest constraint: it pins the depth/speed ambiguity.
   */
  end?: { t: number; p: Vec3; sigma: Vec3 };
}

/** Hinge: 0 inside [lo, hi], linear outside, in units of `scale`. */
const hinge = (v: number, lo: number, hi: number, scale: number) =>
  v < lo ? (lo - v) / scale : v > hi ? (v - hi) / scale : 0;

/**
 * Soft physical plausibility terms. Monocular depth is ambiguous for shots
 * moving along the camera axis; real rallies are not: the shuttle clears the
 * net, lands around the opposite half and leaves the racket at a human speed.
 */
function plausibility(start: FlightState, prior: LaunchPrior): number[] {
  const speed = Math.hypot(...start.v);
  const out = [hinge(speed, 2, 95, 5)];
  let st = start;
  let t = 0;
  let netZ: number | null = null;
  let landing: Vec2 | null = null;
  const dt = 1 / 120;
  while (t < 4) {
    const next = step(st, dt);
    if (netZ === null && Math.sign(st.p[1]) !== Math.sign(next.p[1]) && next.p[1] !== st.p[1]) {
      const a = st.p[1] / (st.p[1] - next.p[1]);
      netZ = st.p[2] + a * (next.p[2] - st.p[2]);
    }
    if (next.p[2] <= 0) {
      landing = { x: next.p[0], y: next.p[1] };
      break;
    }
    st = next;
    t += dt;
  }
  // Clears the net (shots into the net exist but are rare; keep it soft).
  out.push(netZ === null ? 0 : hinge(netZ, 1.3, 50, 0.3));
  if (landing) {
    out.push(hinge(prior.towardsY * landing.y, -1, 8, 0.75));
    out.push(hinge(Math.abs(landing.x), 0, 4.5, 0.75));
  } else {
    out.push(2);
  }
  return out;
}

export interface FlightFit {
  start: FlightState;
  speed: number;
  /** RMS reprojection error in pixels. */
  rmsPx: number;
  summary: FlightSummary;
}

const PX_SIGMA = 3;

export function residuals(theta: number[], cam: Camera, obs: readonly Observation[], prior: LaunchPrior) {
  const start: FlightState = { p: [theta[0]!, theta[1]!, theta[2]!], v: [theta[3]!, theta[4]!, theta[5]!] };
  const pts = simulate(start, obs.map((o) => o.t));
  const r: number[] = [];
  for (let i = 0; i < obs.length; i++) {
    const p = pts[i]!;
    const px = p[2] < -0.5 ? null : project(cam, p);
    if (!px) {
      r.push(1e3, 1e3);
      continue;
    }
    r.push((px.x - obs[i]!.px.x) / PX_SIGMA, (px.y - obs[i]!.px.y) / PX_SIGMA);
  }
  for (let k = 0; k < 3; k++) r.push((theta[k]! - prior.p[k]!) / prior.sigma[k]!);
  if (prior.end) {
    const [pe] = simulate(start, [prior.end.t]);
    for (let k = 0; k < 3; k++) r.push((pe![k]! - prior.end.p[k]!) / prior.end.sigma[k]!);
  }
  r.push(...plausibility(start, prior));
  return r;
}

function cost(r: number[]) {
  return r.reduce((s, v) => s + v * v, 0);
}

/** Levenberg–Marquardt on θ = (p₀, v₀) with a numeric Jacobian. */
function levenberg(theta0: number[], f: (t: number[]) => number[], iters = 40) {
  let theta = [...theta0];
  let r = f(theta);
  let c = cost(r);
  let lambda = 1e-2;
  for (let it = 0; it < iters; it++) {
    const J: number[][] = [];
    for (let j = 0; j < theta.length; j++) {
      const h = j < 3 ? 1e-4 : 1e-3;
      const tp = [...theta];
      tp[j]! += h;
      const rp = f(tp);
      J.push(rp.map((v, i) => (v - r[i]!) / h));
    }
    // Normal equations: (JᵀJ + λ·diag) δ = −Jᵀr
    const n = theta.length;
    const A = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => J[i]!.reduce((s, v, k) => s + v * J[j]![k]!, 0)),
    );
    const g = Array.from({ length: n }, (_, i) => J[i]!.reduce((s, v, k) => s + v * r[k]!, 0));
    let improved = false;
    for (let tries = 0; tries < 8; tries++) {
      const Ad = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-9 : v)));
      const delta = solve(
        Ad,
        g.map((v) => -v),
      );
      if (!delta) break;
      const cand = theta.map((v, i) => v + delta[i]!);
      const rc = f(cand);
      const cc = cost(rc);
      if (cc < c) {
        theta = cand;
        r = rc;
        const rel = (c - cc) / c;
        c = cc;
        lambda = Math.max(1e-7, lambda / 3);
        improved = true;
        if (rel < 1e-6) return { theta, cost: c, r };
        break;
      }
      lambda *= 4;
    }
    if (!improved) break;
  }
  return { theta, cost: c, r };
}

/**
 * Fits a launch (p₀, v₀) to the image track that follows a hit.
 * Needs ≥ 4 observations; more (8–20) gives much better speeds.
 */
export function fitFlight(cam: Camera, obs: readonly Observation[], prior: LaunchPrior): FlightFit | null {
  if (obs.length < 4) return null;
  const f = (t: number[]) => residuals(t, cam, obs, prior);
  let best: { theta: number[]; cost: number; r: number[] } | null = null;
  // Multi-start over plausible launch speeds and elevations: the problem is
  // non-convex (depth/speed ambiguity), a single start often lands in the
  // wrong basin.
  for (const speed of [8, 20, 40, 70]) {
    for (const elev of [-25, 0, 20, 50]) {
      for (const yaw of [-15, 0, 15]) {
        const e = (elev * Math.PI) / 180;
        const a = (yaw * Math.PI) / 180;
        const v: Vec3 = [
          speed * Math.cos(e) * Math.sin(a),
          prior.towardsY * speed * Math.cos(e) * Math.cos(a),
          speed * Math.sin(e),
        ];
        const theta0 = [...prior.p, ...v];
        const res = levenberg(theta0, f, 25);
        if (!best || res.cost < best.cost) best = res;
      }
    }
  }
  if (!best) return null;
  const refined = levenberg(best.theta, f, 60);
  const th = refined.theta;
  const start: FlightState = { p: [th[0]!, th[1]!, th[2]!], v: [th[3]!, th[4]!, th[5]!] };
  const reproj = refined.r.slice(0, obs.length * 2);
  const rmsPx = Math.sqrt(reproj.reduce((s, v) => s + v * v, 0) / obs.length) * PX_SIGMA;
  return { start, speed: Math.hypot(...start.v), rmsPx, summary: summarise(start) };
}
