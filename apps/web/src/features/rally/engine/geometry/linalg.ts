/** Small dense linear algebra helpers (row-major), enough for homographies and LM fits. */

export type Vec2 = { x: number; y: number };
export type Vec3 = [number, number, number];
/** Row-major 3×3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Solves A·x = b (A is n×n, row-major) with partial pivoting. Returns null if singular. */
export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(M[pivot]![col]!) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot]!, M[col]!];
    const p = M[col]!;
    for (let r = col + 1; r < n; r++) {
      const row = M[r]!;
      const f = row[col]! / p[col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) row[c]! -= f * p[c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const row = M[r]!;
    let s = row[n]!;
    for (let c = r + 1; c < n; c++) s -= row[c]! * x[c]!;
    x[r] = s / row[r]!;
  }
  return x;
}

/** Least squares min ||A·x − b|| via normal equations, with optional Tikhonov damping. */
export function leastSquares(A: number[][], b: number[], damping = 0): number[] | null {
  const n = A[0]!.length;
  const AtA = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const Atb = new Array<number>(n).fill(0);
  for (let r = 0; r < A.length; r++) {
    const row = A[r]!;
    for (let i = 0; i < n; i++) {
      Atb[i]! += row[i]! * b[r]!;
      for (let j = 0; j < n; j++) AtA[i]![j]! += row[i]! * row[j]!;
    }
  }
  if (damping > 0) for (let i = 0; i < n; i++) AtA[i]![i]! += damping * (AtA[i]![i]! || 1);
  return solve(AtA, Atb);
}

export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9) as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
  return r;
}

export function mat3Inv(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  const s = 1 / det;
  return [
    A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
    B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
    C * s, -(a * h - b * g) * s, (a * e - b * d) * s,
  ];
}

export function mat3Apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Applies a homography to a 2D point. Returns null for points at infinity. */
export function applyH(H: Mat3, p: Vec2): Vec2 | null {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (Math.abs(w) < 1e-12) return null;
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const dist2 = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
