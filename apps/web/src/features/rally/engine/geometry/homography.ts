/** Planar homography estimation (normalised DLT, h33 = 1). */
import { applyH, leastSquares, mat3Inv, mat3Mul, type Mat3, type Vec2 } from "./linalg";

/** Similarity transform that moves points to zero mean and √2 mean distance (Hartley). */
function normaliser(pts: readonly Vec2[]): Mat3 {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  const d = pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / n || 1;
  const s = Math.SQRT2 / d;
  return [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1];
}

/**
 * Homography H with dst ≈ H·src, from ≥ 4 correspondences (least squares
 * when more). Returns null for degenerate input (e.g. 3 collinear points).
 */
export function estimateHomography(src: readonly Vec2[], dst: readonly Vec2[]): Mat3 | null {
  if (src.length !== dst.length || src.length < 4) return null;
  const Ts = normaliser(src);
  const Td = normaliser(dst);
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const s = applyH(Ts, src[i]!)!;
    const d = applyH(Td, dst[i]!)!;
    A.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y]);
    b.push(d.x);
    A.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y]);
    b.push(d.y);
  }
  const h = leastSquares(A, b);
  if (!h || h.some((v) => !Number.isFinite(v))) return null;
  const Hn: Mat3 = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
  const TdInv = mat3Inv(Td);
  if (!TdInv) return null;
  const H = mat3Mul(mat3Mul(TdInv, Hn), Ts);
  const k = H[8];
  if (Math.abs(k) < 1e-12) return null;
  return H.map((v) => v / k) as Mat3;
}

/** RMS reprojection error of dst vs H·src, in dst units. */
export function homographyError(H: Mat3, src: readonly Vec2[], dst: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < src.length; i++) {
    const p = applyH(H, src[i]!);
    if (!p) return Infinity;
    s += (p.x - dst[i]!.x) ** 2 + (p.y - dst[i]!.y) ** 2;
  }
  return Math.sqrt(s / src.length);
}
