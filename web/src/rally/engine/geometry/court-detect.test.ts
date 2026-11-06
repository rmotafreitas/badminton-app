import { describe, expect, it } from "vitest";
import { project } from "./camera";
import { COURT_CORNERS, COURT_LINES } from "./court";
import { detectCourt, type GrayImage } from "./court-detect";
import { cross3, norm3, scale3, sub3, type Mat3, type Vec2, type Vec3 } from "./linalg";

function lookAt(eye: Vec3, target: Vec3, f: number, width: number, height: number) {
  const fwd = sub3(target, eye);
  const z = scale3(fwd, 1 / norm3(fwd));
  let x = cross3(z, [0, 0, 1]);
  x = scale3(x, 1 / norm3(x));
  const y = cross3(z, x);
  const R: Mat3 = [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
  const t: Vec3 = [
    -(R[0] * eye[0] + R[1] * eye[1] + R[2] * eye[2]),
    -(R[3] * eye[0] + R[4] * eye[1] + R[5] * eye[2]),
    -(R[6] * eye[0] + R[7] * eye[1] + R[8] * eye[2]),
  ];
  return { f, cx: width / 2, cy: height / 2, width, height, R, t, centre: eye, focalFromPrior: false };
}

function render(cam: ReturnType<typeof lookAt>, extraCourtsX: number[] = [], clutter = 0): GrayImage {
  const { width: w, height: h } = cam;
  const data = new Uint8Array(w * h);
  let seed = 5;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < data.length; i++) data[i] = 70 + Math.floor(rnd() * 25); // green-ish floor
  const paint = (p: Vec2, r: number, v: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(p.x) + dx;
        const y = Math.round(p.y) + dy;
        if (x >= 0 && y >= 0 && x < w && y < h && dx * dx + dy * dy <= r * r) data[y * w + x] = v;
      }
  };
  for (const ox of [0, ...extraCourtsX]) {
    for (const l of COURT_LINES) {
      for (let u = 0; u <= 1; u += 0.002) {
        const X: Vec3 = [ox + l.a.x + u * (l.b.x - l.a.x), l.a.y + u * (l.b.y - l.a.y), 0];
        const p = project(cam, X);
        if (!p) continue;
        // Lines get thinner with distance.
        paint(p, X[1] > 2 ? 1 : 2, 215 + Math.floor(rnd() * 30));
      }
    }
  }
  // Nets: white top tape at 1.55 m and the two posts, for every court.
  for (const ox of [0, ...extraCourtsX]) {
    const segs: [Vec3, Vec3][] = [
      [[ox - 3.05, 0, 1.55], [ox + 3.05, 0, 1.55]],
      [[ox - 3.05, 0, 0], [ox - 3.05, 0, 1.55]],
      [[ox + 3.05, 0, 0], [ox + 3.05, 0, 1.55]],
    ];
    for (const [a, b] of segs) {
      for (let u = 0; u <= 1; u += 0.002) {
        const p = project(cam, [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])]);
        if (p) paint(p, 1, 225);
      }
    }
  }
  // Clutter: bright random segments (bags, benches, walls).
  for (let k = 0; k < clutter; k++) {
    const a = { x: rnd() * w, y: rnd() * h };
    const ang = rnd() * Math.PI;
    const len = 20 + rnd() * 80;
    for (let u = 0; u <= len; u += 0.5) paint({ x: a.x + Math.cos(ang) * u, y: a.y + Math.sin(ang) * u }, 1, 230);
  }
  return { width: w, height: h, data };
}

function cornerError(found: Vec2[], cam: ReturnType<typeof lookAt>) {
  return Math.max(
    ...COURT_CORNERS.map((c, i) => {
      const t = project(cam, [c.x, c.y, 0])!;
      return Math.hypot(found[i]!.x - t.x, found[i]!.y - t.y);
    }),
  );
}

describe("court detection", () => {
  it("finds the court from behind the baseline (landscape)", () => {
    const cam = lookAt([0.4, -10.5, 2.8], [0, 0.5, 0], 560, 640, 360);
    const t0 = performance.now();
    const det = detectCourt(render(cam, [], 12))!;
    const ms = performance.now() - t0;
    expect(det).not.toBeNull();
    expect(det.score).toBeGreaterThan(0.7);
    // Near corners may be outside the frame; compare those inside.
    expect(cornerError(det.corners, cam)).toBeLessThan(6);
    expect(ms).toBeLessThan(5000);
  });

  it("ignores a neighbouring court", () => {
    const cam = lookAt([0.2, -11, 3.2], [0, 0.5, 0], 520, 640, 360);
    const det = detectCourt(render(cam, [7.3, -7.3], 8))!;
    expect(det).not.toBeNull();
    expect(cornerError(det.corners, cam)).toBeLessThan(8);
  });

  it("works from a corner, side-on angle (portrait)", () => {
    const cam = lookAt([-5.5, -8.5, 2.5], [0, 0, 0], 600, 360, 640);
    const det = detectCourt(render(cam, [], 10))!;
    expect(det).not.toBeNull();
    expect(cornerError(det.corners, cam)).toBeLessThan(8);
  });
});
