/**
 * Automatic court detection from a single frame (no ML model needed).
 *
 *  1. line mask: thin bright ridges (painted lines are brighter than the
 *     floor on both sides at a line-width offset — Farin et al. style);
 *  2. Hough transform → candidate image lines;
 *  3. hypotheses: two pairs of image lines ↔ an axis-aligned court
 *     rectangle (across pair × sideline pair);
 *  4. prune geometrically — convex quad, the two focal-length constraints
 *     agree (wrong aspect ratios don't), camera upright at a sane height;
 *  5. score every hypothesis by how much of the projected court model lands
 *     on line pixels (chamfer distance), keep the best;
 *  6. refine with every visible line intersection.
 * Works from any viewpoint as long as ~2 lines of each family are visible.
 */
import {
  cameraFromHomography,
  centreHomography,
  focalCandidates,
  isPlausiblePhonePose,
  isUpright,
  project,
  type Camera,
} from "./camera";
import { COURT, COURT_CORNERS, COURT_LINES, type CourtLine } from "./court";
import { estimateHomography } from "./homography";
import { applyH, mat3Mul, type Mat3, type Vec2, type Vec3 } from "./linalg";

export interface GrayImage {
  width: number;
  height: number;
  /** Luminance 0–255, row-major. */
  data: Uint8Array;
}

export interface CourtDetection {
  /** World floor (m) → image px (in the coordinates of the input image). */
  H: Mat3;
  corners: [Vec2, Vec2, Vec2, Vec2];
  /** 0–1 fraction of the visible court model supported by line pixels. */
  score: number;
  /** Fraction of court line length inside the frame. */
  visible: number;
}

export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < data.length; i += 4, p++) {
    data[p] = (rgba[i]! * 77 + rgba[i + 1]! * 150 + rgba[i + 2]! * 29) >> 8;
  }
  return { width, height, data };
}

/** Thin bright line pixels (1) vs. everything else (0). */
export function lineMask(img: GrayImage, tau = 4, minLum = 110, minDiff = 18): Uint8Array {
  const { width: w, height: h, data } = img;
  const m = new Uint8Array(w * h);
  for (let y = tau; y < h - tau; y++) {
    for (let x = tau; x < w - tau; x++) {
      const i = y * w + x;
      const l = data[i]!;
      if (l < minLum) continue;
      const horiz = l - data[i - tau]! > minDiff && l - data[i + tau]! > minDiff;
      const vert = l - data[i - tau * w]! > minDiff && l - data[i + tau * w]! > minDiff;
      if (horiz || vert) m[i] = 1;
    }
  }
  return m;
}

/** Two-pass chamfer distance transform (px to the nearest mask pixel). */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e6;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  const a = 1;
  const b = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i]!;
      if (x > 0) v = Math.min(v, d[i - 1]! + a);
      if (y > 0) {
        v = Math.min(v, d[i - w]! + a);
        if (x > 0) v = Math.min(v, d[i - w - 1]! + b);
        if (x < w - 1) v = Math.min(v, d[i - w + 1]! + b);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i]!;
      if (x < w - 1) v = Math.min(v, d[i + 1]! + a);
      if (y < h - 1) {
        v = Math.min(v, d[i + w]! + a);
        if (x < w - 1) v = Math.min(v, d[i + w + 1]! + b);
        if (x > 0) v = Math.min(v, d[i + w - 1]! + b);
      }
      d[i] = v;
    }
  }
  return d;
}

export interface HoughLine {
  /** Normal angle (rad, 0..π) and signed distance from the image centre. */
  theta: number;
  rho: number;
  votes: number;
}

/**
 * Local orientation of each line pixel (PCA over its mask neighbourhood).
 * Returns NaN for pixels that aren't part of a 1D structure (blobs, text,
 * clothing edges), which then don't vote at all.
 */
export function lineOrientation(mask: Uint8Array, w: number, h: number, r = 4, minAniso = 0.75): Float32Array {
  const out = new Float32Array(w * h).fill(NaN);
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      if (!mask[y * w + x]) continue;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      for (let dy = -r; dy <= r; dy++) {
        const row = (y + dy) * w;
        for (let dx = -r; dx <= r; dx++) {
          if (!mask[row + x + dx]) continue;
          n++;
          sx += dx;
          sy += dy;
          sxx += dx * dx;
          syy += dy * dy;
          sxy += dx * dy;
        }
      }
      if (n < 5) continue;
      const mx = sx / n;
      const my = sy / n;
      const cxx = sxx / n - mx * mx;
      const cyy = syy / n - my * my;
      const cxy = sxy / n - mx * my;
      const tr = cxx + cyy;
      const disc = Math.sqrt((cxx - cyy) ** 2 + 4 * cxy * cxy);
      if (tr <= 0 || disc / tr < minAniso) continue;
      out[y * w + x] = 0.5 * Math.atan2(2 * cxy, cxx - cyy); // line direction
    }
  }
  return out;
}

export function houghLines(mask: Uint8Array, w: number, h: number, maxLines = 40): HoughLine[] {
  const nTheta = 180;
  const cx = w / 2;
  const cy = h / 2;
  const maxRho = Math.ceil(Math.hypot(w, h) / 2);
  const nRho = 2 * maxRho + 1;
  const acc = new Uint32Array(nTheta * nRho);
  const cos = new Float32Array(nTheta);
  const sin = new Float32Array(nTheta);
  for (let t = 0; t < nTheta; t++) {
    cos[t] = Math.cos((t * Math.PI) / nTheta);
    sin[t] = Math.sin((t * Math.PI) / nTheta);
  }
  const orient = lineOrientation(mask, w, h);
  const spread = 6; // degrees either side of the local orientation
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = orient[y * w + x]!;
      if (Number.isNaN(o)) continue;
      const dx = x - cx;
      const dy = y - cy;
      // Normal angle = line direction + 90°, in [0, 180).
      let t0 = Math.round(((o + Math.PI / 2) * 180) / Math.PI);
      t0 = ((t0 % 180) + 180) % 180;
      for (let k = -spread; k <= spread; k++) {
        const t = (t0 + k + 180) % 180;
        const r = Math.round(dx * cos[t]! + dy * sin[t]!) + maxRho;
        acc[t * nRho + r]!++;
      }
    }
  }
  // Peaks with non-maximum suppression (±3°, ±8 px).
  const minVotes = Math.max(25, Math.min(w, h) * 0.06);
  const peaks: HoughLine[] = [];
  const order: number[] = [];
  for (let i = 0; i < acc.length; i++) if (acc[i]! >= minVotes) order.push(i);
  order.sort((a, b) => acc[b]! - acc[a]!);
  for (const i of order) {
    const t = Math.floor(i / nRho);
    const r = (i % nRho) - maxRho;
    const theta = (t * Math.PI) / nTheta;
    const clash = peaks.some((p) => {
      let dt = Math.abs(p.theta - theta);
      let dr = Math.abs(p.rho - r);
      if (dt > Math.PI / 2) {
        // Wrap-around: (θ, ρ) ≡ (θ − π, −ρ).
        dt = Math.PI - dt;
        dr = Math.abs(p.rho + r);
      }
      return dt < (3 * Math.PI) / 180 && dr < 8;
    });
    if (clash) continue;
    peaks.push({ theta, rho: r, votes: acc[i]! });
    if (peaks.length >= maxLines) break;
  }
  return peaks.map((p) => ({ ...p, rho: p.rho }));
}

/** Image-space line a·x + b·y = c (a² + b² = 1) for a Hough line. */
function toABC(l: HoughLine, w: number, h: number) {
  const a = Math.cos(l.theta);
  const b = Math.sin(l.theta);
  return { a, b, c: l.rho + a * (w / 2) + b * (h / 2) };
}

function intersect(l1: { a: number; b: number; c: number }, l2: { a: number; b: number; c: number }): Vec2 | null {
  const det = l1.a * l2.b - l2.a * l1.b;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (l1.c * l2.b - l2.c * l1.b) / det, y: (l1.a * l2.c - l2.a * l1.c) / det };
}


/**
 * Sample points along a model line, projected into the image. Points behind
 * the camera are dropped (null) so segments crossing the horizon don't wrap.
 */
function projectedSamples(H: Mat3, line: CourtLine, step = 0.1): (Vec2 | null)[] {
  const len = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
  const n = Math.max(2, Math.ceil(len / step));
  const out: (Vec2 | null)[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = line.a.x + u * (line.b.x - line.a.x);
    const y = line.a.y + u * (line.b.y - line.a.y);
    const wv = H[6] * x + H[7] * y + H[8];
    out.push(wv > 1e-9 ? applyH(H, { x, y }) : null);
  }
  return out;
}

interface Score {
  /** Line-pixel-length weighted support minus penalty, / mask size: used to rank. */
  value: number;
  /** Supported fraction of the projected model inside the frame (0–1). */
  score: number;
  /** Fraction of model samples inside the frame. */
  visible: number;
}

/** 3D net features: top tape and both posts (strong, distinctive lines). */
const NET_SEGMENTS: [Vec3, Vec3][] = [
  [[-COURT.halfDoublesWidth, 0, COURT.netHeightPosts], [COURT.halfDoublesWidth, 0, COURT.netHeightPosts]],
  [[-COURT.halfDoublesWidth, 0, 0], [-COURT.halfDoublesWidth, 0, COURT.netHeightPosts]],
  [[COURT.halfDoublesWidth, 0, 0], [COURT.halfDoublesWidth, 0, COURT.netHeightPosts]],
];

function netSamples(cam: Camera, step = 0.1): (Vec2 | null)[][] {
  return NET_SEGMENTS.map(([a, b]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(2, Math.ceil(len / step));
    const out: (Vec2 | null)[] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      out.push(project(cam, [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])]));
    }
    return out;
  });
}

export function scoreHomography(
  H: Mat3,
  dist: Float32Array,
  w: number,
  h: number,
  maskCount: number,
  sigma = 2.5,
  step = 0.1,
  cam?: Camera | null,
): Score {
  let supported = 0;
  let unsupported = 0;
  let total = 0;
  let inside = 0;
  const inFrame = (p: Vec2 | null): p is Vec2 => !!p && p.x >= 1 && p.y >= 1 && p.x < w - 1 && p.y < h - 1;
  const polylines: (Vec2 | null)[][] = COURT_LINES.map((line) => projectedSamples(H, line, step));
  const netStart = polylines.length;
  if (cam) polylines.push(...netSamples(cam, step));
  for (let li = 0; li < polylines.length; li++) {
    const pts = polylines[li]!;
    const isNet = li >= netStart;
    for (let i = 0; i < pts.length; i++) {
      total++;
      const p = pts[i]!;
      if (!inFrame(p)) continue;
      inside++;
      const q = pts[i + 1];
      if (!inFrame(q ?? null)) continue;
      const seg = Math.hypot(q!.x - p.x, q!.y - p.y);
      const mx = Math.round((p.x + q!.x) / 2);
      const my = Math.round((p.y + q!.y) / 2);
      const d = dist[my * w + mx]!;
      const sup = Math.exp(-(d * d) / (2 * sigma * sigma));
      // Net evidence counts for, never against (nets can be down or dark).
      if (isNet) {
        supported += 1.5 * seg * sup;
        continue;
      }
      supported += seg * sup;
      unsupported += seg * (1 - sup);
    }
  }
  if (!inside || supported + unsupported === 0) return { value: -Infinity, score: 0, visible: 0 };
  return {
    value: (supported - 0.6 * unsupported) / Math.max(1, maskCount),
    score: supported / (supported + unsupported),
    visible: inside / total,
  };
}

/** Quick plausibility of a court homography for a phone recording. */
function plausible(H: Mat3, w: number, h: number): boolean {
  const corners = COURT_CORNERS.map((c) => applyH(H, c));
  if (corners.some((c) => !c)) return false;
  const q = corners as Vec2[];
  // Convex, consistently oriented quad.
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    const c = q[(i + 2) % 4]!;
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1) return false;
    if (sign === 0) sign = Math.sign(cr);
    else if (Math.sign(cr) !== sign) return false;
  }
  // Court can't be microscopic or absurdly huge in the frame.
  const area = Math.abs(
    q.reduce((s, p, i) => s + p.x * q[(i + 1) % 4]!.y - q[(i + 1) % 4]!.x * p.y, 0) / 2,
  );
  if (area < w * h * 0.02 || area > w * h * 60) return false;
  const cam = cameraFromHomography(H, w, h);
  if (!cam || !isUpright(cam)) return false;
  if (cam.centre[2] < 0.3 || cam.centre[2] > 25) return false;
  return true;
}

const ACROSS = COURT_LINES.filter((l) => l.family === "across"); // ordered by y desc
const ALONG = COURT_LINES.filter((l) => l.family === "along" && !l.id.startsWith("centre"));

function modelABC(l: CourtLine) {
  // Model lines are axis aligned: across → y = c, along → x = c.
  return l.family === "across" ? { a: 0, b: 1, c: l.a.y } : { a: 1, b: 0, c: l.a.x };
}

/** Convex, non-degenerate quad (corners in order)? */
function convexQuad(q: Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    const c = q[(i + 2) % 4]!;
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 4) return false;
    if (sign === 0) sign = Math.sign(cr);
    else if (Math.sign(cr) !== sign) return false;
  }
  return true;
}

/**
 * Fast geometric screen: a wrong rectangle aspect ratio makes the two
 * independent focal-length constraints disagree.
 */
function focalConsistent(H: Mat3, w: number, h: number): boolean {
  const f = focalCandidates(centreHomography(H, w, h));
  const lo = 0.35 * Math.max(w, h);
  const hi = 4 * Math.max(w, h);
  const ok = f.filter((v) => v >= lo && v <= hi);
  if (!ok.length) return false;
  if (f.length === 2) return Math.max(f[0]!, f[1]!) / Math.min(f[0]!, f[1]!) < 1.35;
  return true;
}

/** World axis-aligned rectangle [x0,x1]×[y0,y1] → unit square (affine). */
function rectToUnit(x0: number, x1: number, y0: number, y1: number): Mat3 {
  const sx = 1 / (x1 - x0);
  const sy = 1 / (y1 - y0);
  return [sx, 0, -x0 * sx, 0, sy, -y0 * sy, 0, 0, 1];
}

const UNIT: Vec2[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/**
 * Detects the court. Returns null when nothing plausible is found.
 * ≈ 0.3–1.5 s on a 640-px frame; run it in a worker.
 */
export function detectCourt(img: GrayImage, opts: { maxLines?: number } = {}): CourtDetection | null {
  const { width: w, height: h } = img;
  const mask = lineMask(img);
  const maskCount = mask.reduce((a, v) => a + v, 0);
  const dist = distanceTransform(mask, w, h);
  const lines = houghLines(mask, w, h, 40);
  if (lines.length < 4) return null;
  // No orientation split: in perspective the two sidelines lean opposite
  // ways, so angle clustering mixes families. Geometric pruning below is
  // what rejects wrong pairings.
  const L = [...lines]
    .sort((a, b) => b.votes - a.votes)
    .slice(0, opts.maxLines ?? 14)
    .map((l) => toABC(l, w, h));
  const pairs: [number, number][] = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) pairs.push([i, j]);

  // Model rectangles: an across pair (y0 < y1) × a sideline pair (x0 < x1).
  const ys = [...new Set(ACROSS.map((l) => l.a.y))].sort((a, b) => a - b);
  const xs = [...new Set(ALONG.map((l) => l.a.x))].sort((a, b) => a - b);
  const rects: Mat3[] = [];
  for (let i = 0; i < ys.length; i++)
    for (let j = i + 1; j < ys.length; j++)
      for (let p = 0; p < xs.length; p++)
        for (let q = p + 1; q < xs.length; q++) {
          // Unit square corner order (0,0),(1,0),(1,1),(0,1) ↔ (x0,y0),(x1,y0),(x1,y1),(x0,y1),
          // plus the mirrored x order (the handedness check drops one of them).
          rects.push(rectToUnit(xs[p]!, xs[q]!, ys[i]!, ys[j]!));
          rects.push(rectToUnit(xs[q]!, xs[p]!, ys[i]!, ys[j]!));
        }

  const shortlist: { H: Mat3; value: number }[] = [];
  const keep = 30;
  const consider = (H: Mat3) => {
    if (!focalConsistent(H, w, h)) return;
    const cam = cameraFromHomography(H, w, h);
    if (!cam || !isUpright(cam) || cam.centre[2] < 0.3 || cam.centre[2] > 15) return;
    if (!isPlausiblePhonePose(cam)) return;
    if (Math.hypot(cam.centre[0], cam.centre[1]) > 40) return;
    const s = scoreHomography(H, dist, w, h, maskCount, 2.5, 0.6, cam);
    if (shortlist.length < keep || s.value > shortlist[shortlist.length - 1]!.value) {
      shortlist.push({ H, value: s.value });
      shortlist.sort((a, b) => b.value - a.value);
      if (shortlist.length > keep) shortlist.pop();
    }
  };

  for (const [i, j] of pairs) {
    for (const [k2, l] of pairs) {
      if (k2 === i || k2 === j || l === i || l === j) continue;
      const X = L;
      const Y = L;
      // Quad corners ↔ unit square: (Y[k2]∩X[i]), (Y[l]∩X[i]), (Y[l]∩X[j]), (Y[k2]∩X[j]).
      const q = [
        intersect(X[i]!, Y[k2]!),
        intersect(X[i]!, Y[l]!),
        intersect(X[j]!, Y[l]!),
        intersect(X[j]!, Y[k2]!),
      ];
      if (q.some((p) => !p || Math.abs(p.x - w / 2) > 4 * w || Math.abs(p.y - h / 2) > 4 * h)) continue;
      if (!convexQuad(q as Vec2[])) continue;
      for (const order of [q, [q[3], q[2], q[1], q[0]]]) {
        const Q = estimateHomography(UNIT, order as Vec2[]);
        if (!Q) continue;
        for (const S of rects) consider(mat3Mul(Q, S));
      }
    }
  }
  if (!shortlist.length) return null;
  let best: { H: Mat3; s: Score } | null = null;
  for (const c of shortlist) {
    const H = refine(c.H, mask, w, h);
    const s = scoreHomography(H, dist, w, h, maskCount, 2.5, 0.1, cameraFromHomography(H, w, h));
    if (!best || s.value > best.s.value) best = { H, s };
  }
  const H = canonical(best!.H, w, h);
  const s = scoreHomography(H, dist, w, h, maskCount);
  const corners = COURT_CORNERS.map((c) => applyH(H, c)!) as [Vec2, Vec2, Vec2, Vec2];
  return { H, corners, score: s.score, visible: s.visible };
}

/**
 * Refines a homography: re-fits each visible model line to the mask pixels
 * near its projection, then re-estimates H from all line intersections.
 */
function refine(H0: Mat3, mask: Uint8Array, w: number, h: number, iters = 3): Mat3 {
  let H = H0;
  for (let it = 0; it < iters; it++) {
    const fitted = new Map<string, { a: number; b: number; c: number }>();
    const band = it === 0 ? 6 : 3;
    for (const line of COURT_LINES) {
      const pts: Vec2[] = [];
      const samples = projectedSamples(H, line, 0.05);
      for (const p of samples) {
        if (!p) continue;
        // Search perpendicular-ish neighbourhood for mask pixels.
        for (let dy = -band; dy <= band; dy++) {
          for (let dx = -band; dx <= band; dx++) {
            const x = Math.round(p.x) + dx;
            const y = Math.round(p.y) + dy;
            if (x < 0 || y < 0 || x >= w || y >= h || !mask[y * w + x]) continue;
            pts.push({ x, y });
          }
        }
      }
      if (pts.length < 30) continue;
      const l = fitLine(pts);
      if (l) fitted.set(line.id, l);
    }
    const src: Vec2[] = [];
    const dst: Vec2[] = [];
    const ids = [...fitted.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const L1 = COURT_LINES.find((l) => l.id === ids[i])!;
        const L2 = COURT_LINES.find((l) => l.id === ids[j])!;
        if (L1.family === L2.family) continue;
        const wpt = intersect(modelABC(L1), modelABC(L2));
        const ipt = intersect(fitted.get(ids[i]!)!, fitted.get(ids[j]!)!);
        if (!wpt || !ipt) continue;
        // Only intersections that exist on the court (segments may end).
        if (!onSegment(L1, wpt) || !onSegment(L2, wpt)) continue;
        src.push(wpt);
        dst.push(ipt);
      }
    }
    if (src.length < 4) break;
    const Hn = estimateHomography(src, dst);
    if (!Hn || !plausible(Hn, w, h)) break;
    H = Hn;
  }
  return H;
}

/**
 * The court is symmetric under a 180° rotation, so detection can't tell the
 * halves apart; by convention the near half (y < 0) faces the camera.
 */
export function canonical(H: Mat3, w: number, h: number): Mat3 {
  const cam = cameraFromHomography(H, w, h);
  if (!cam || cam.centre[1] <= 0) return H;
  // H·diag(−1, −1, 1): world (x, y) → (−x, −y).
  return [-H[0], -H[1], H[2], -H[3], -H[4], H[5], -H[6], -H[7], H[8]];
}

function onSegment(l: CourtLine, p: Vec2) {
  const eps = 0.01;
  return (
    p.x >= Math.min(l.a.x, l.b.x) - eps &&
    p.x <= Math.max(l.a.x, l.b.x) + eps &&
    p.y >= Math.min(l.a.y, l.b.y) - eps &&
    p.y <= Math.max(l.a.y, l.b.y) + eps
  );
}

/** Total least squares line through points. */
function fitLine(pts: Vec2[]) {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  // Normal = eigenvector of the smallest eigenvalue of the scatter matrix.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const a = -Math.sin(theta);
  const b = Math.cos(theta);
  return { a, b, c: a * mx + b * my };
}
