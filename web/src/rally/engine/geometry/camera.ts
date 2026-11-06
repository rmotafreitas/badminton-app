/**
 * Pinhole camera recovered from a single floor homography (Zhang-style
 * single-view calibration): principal point at the image centre, square
 * pixels, zero skew, unknown focal length. This is what lets us reason about
 * the shuttle in 3D (it flies; the floor homography alone only describes z=0).
 */
import { cross3, dot3, mat3Apply, norm3, scale3, sub3, type Mat3, type Vec2, type Vec3 } from "./linalg";

export interface Camera {
  /** Focal length in pixels. */
  f: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** World→camera rotation, row-major. Camera axes: x right, y down, z forward. */
  R: Mat3;
  t: Vec3;
  /** Camera centre in world coordinates (metres). */
  centre: Vec3;
  /** True if the focal length came from the fallback FOV, not the geometry. */
  focalFromPrior: boolean;
}

/** Typical phone main camera: ~68° across the long side. */
export function priorFocal(width: number, height: number): number {
  return (Math.max(width, height) / 2) / Math.tan((68 / 2) * (Math.PI / 180));
}

function focalCandidates(h: Mat3): number[] {
  // Columns of the (centred) homography.
  const [h11, h12, , h21, h22, , h31, h32] = h;
  const out: number[] = [];
  const den1 = h31 * h32;
  if (Math.abs(den1) > 1e-12) {
    const f2 = -(h11 * h12 + h21 * h22) / den1;
    if (f2 > 0) out.push(Math.sqrt(f2));
  }
  const den2 = h31 * h31 - h32 * h32;
  if (Math.abs(den2) > 1e-12) {
    const f2 = -(h11 * h11 + h21 * h21 - h12 * h12 - h22 * h22) / den2;
    if (f2 > 0) out.push(Math.sqrt(f2));
  }
  return out;
}

/**
 * @param H floor (world x,y in metres) → image pixels homography
 * @param focal optional known focal length (px); estimated otherwise
 */
export function cameraFromHomography(
  H: Mat3,
  width: number,
  height: number,
  focal?: number,
): Camera | null {
  const cx = width / 2;
  const cy = height / 2;
  // Move the principal point to the origin: Hc = T·H.
  const Hc: Mat3 = [
    H[0] - cx * H[6], H[1] - cx * H[7], H[2] - cx * H[8],
    H[3] - cy * H[6], H[4] - cy * H[7], H[5] - cy * H[8],
    H[6], H[7], H[8],
  ];
  const prior = priorFocal(width, height);
  let f = focal;
  let focalFromPrior = false;
  if (!f) {
    const lo = 0.4 * Math.max(width, height);
    const hi = 4 * Math.max(width, height);
    const cands = focalCandidates(Hc).filter((v) => v >= lo && v <= hi);
    if (cands.length) {
      f = cands.reduce((a, b) => a + b, 0) / cands.length;
    } else {
      f = prior;
      focalFromPrior = true;
    }
  }

  const col = (j: number): Vec3 => [Hc[j]! / f!, Hc[3 + j]! / f!, Hc[6 + j]!];
  let r1 = col(0);
  let r2 = col(1);
  let t = col(2);
  const lambda = 2 / (norm3(r1) + norm3(r2));
  if (!Number.isFinite(lambda)) return null;
  r1 = scale3(r1, lambda);
  r2 = scale3(r2, lambda);
  t = scale3(t, lambda);
  if (t[2] < 0) {
    // The scene must be in front of the camera.
    r1 = scale3(r1, -1);
    r2 = scale3(r2, -1);
    t = scale3(t, -1);
  }
  // Gram–Schmidt to the nearest proper rotation.
  const e1 = scale3(r1, 1 / norm3(r1));
  const r2o = sub3(r2, scale3(e1, dot3(e1, r2)));
  const e2 = scale3(r2o, 1 / norm3(r2o));
  const e3 = cross3(e1, e2);
  // Columns e1, e2, e3 = world x, y, z axes expressed in camera coordinates.
  const R: Mat3 = [e1[0], e2[0], e3[0], e1[1], e2[1], e3[1], e1[2], e2[2], e3[2]];
  // centre = −Rᵀ t
  const centre: Vec3 = [
    -(R[0] * t[0] + R[3] * t[1] + R[6] * t[2]),
    -(R[1] * t[0] + R[4] * t[1] + R[7] * t[2]),
    -(R[2] * t[0] + R[5] * t[1] + R[8] * t[2]),
  ];
  return { f: f!, cx, cy, width, height, R, t, centre, focalFromPrior };
}

/**
 * True if world +z (up) appears upward in the image, i.e. the court
 * correspondences were labelled with the right handedness. A mirrored
 * labelling yields a camera that is "below the floor".
 */
export function isUpright(cam: Camera): boolean {
  return cam.centre[2] > 0;
}

/** World point (metres) → pixel. Null if behind the camera. */
export function project(cam: Camera, X: Vec3): Vec2 | null {
  const c = mat3Apply(cam.R, X);
  const z = c[2] + cam.t[2];
  if (z <= 1e-6) return null;
  return {
    x: (cam.f * (c[0] + cam.t[0])) / z + cam.cx,
    y: (cam.f * (c[1] + cam.t[1])) / z + cam.cy,
  };
}

/** World-frame direction of the viewing ray through a pixel. */
export function pixelRay(cam: Camera, p: Vec2): Vec3 {
  const d: Vec3 = [(p.x - cam.cx) / cam.f, (p.y - cam.cy) / cam.f, 1];
  const R = cam.R;
  const w: Vec3 = [
    R[0] * d[0] + R[3] * d[1] + R[6] * d[2],
    R[1] * d[0] + R[4] * d[1] + R[7] * d[2],
    R[2] * d[0] + R[5] * d[1] + R[8] * d[2],
  ];
  return scale3(w, 1 / norm3(w));
}

/** Intersects the viewing ray through pixel p with the horizontal plane z = h. */
export function pixelToPlane(cam: Camera, p: Vec2, h = 0): Vec3 | null {
  const d = pixelRay(cam, p);
  if (Math.abs(d[2]) < 1e-9) return null;
  const s = (h - cam.centre[2]) / d[2];
  if (s <= 0) return null;
  return [cam.centre[0] + s * d[0], cam.centre[1] + s * d[1], h];
}
