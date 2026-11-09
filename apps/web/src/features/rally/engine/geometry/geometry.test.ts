import { describe, expect, it } from "vitest";
import { estimateHomography, homographyError } from "./homography";
import { cameraFromHomography, isUpright, pixelToPlane, project } from "./camera";
import { COURT_CORNERS, COURT_LINES, insideCourt } from "./court";
import type { Mat3, Vec2, Vec3 } from "./linalg";
import { cross3, norm3, scale3, sub3 } from "./linalg";

/** A synthetic camera looking at the court, for ground truth. */
function lookAt(eye: Vec3, target: Vec3, f: number, width: number, height: number) {
  const fwd = sub3(target, eye);
  const z = scale3(fwd, 1 / norm3(fwd));
  const worldUp: Vec3 = [0, 0, 1];
  let x = cross3(z, worldUp); // camera right
  x = scale3(x, 1 / norm3(x));
  const y = cross3(z, x); // camera down
  const R: Mat3 = [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
  const t: Vec3 = [
    -(R[0] * eye[0] + R[1] * eye[1] + R[2] * eye[2]),
    -(R[3] * eye[0] + R[4] * eye[1] + R[5] * eye[2]),
    -(R[6] * eye[0] + R[7] * eye[1] + R[8] * eye[2]),
  ];
  return {
    f, cx: width / 2, cy: height / 2, width, height, R, t, centre: eye, focalFromPrior: false,
  };
}

const W = 1280;
const H = 720;
const truth = lookAt([1.2, -11.5, 3.2], [0, 0, 0.8], 950, W, H);

function floorToImage(p: Vec2): Vec2 {
  return project(truth, [p.x, p.y, 0])!;
}

describe("homography", () => {
  it("recovers an exact homography from the 4 court corners", () => {
    const img = COURT_CORNERS.map(floorToImage);
    const Hm = estimateHomography(COURT_CORNERS, img)!;
    expect(Hm).not.toBeNull();
    expect(homographyError(Hm, COURT_CORNERS, img)).toBeLessThan(1e-6);
    // Generalises to every other line endpoint.
    const pts = COURT_LINES.flatMap((l) => [l.a, l.b]);
    expect(homographyError(Hm, pts, pts.map(floorToImage))).toBeLessThan(1e-6);
  });

  it("rejects degenerate input", () => {
    const collinear = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    expect(estimateHomography(collinear, collinear)).toBeNull();
  });
});

describe("camera from homography", () => {
  const Hm = estimateHomography(COURT_CORNERS, COURT_CORNERS.map(floorToImage))!;
  const cam = cameraFromHomography(Hm, W, H)!;

  it("recovers focal length and camera position", () => {
    expect(cam.focalFromPrior).toBe(false);
    expect(cam.f).toBeCloseTo(950, 0);
    expect(cam.centre[0]).toBeCloseTo(1.2, 2);
    expect(cam.centre[1]).toBeCloseTo(-11.5, 2);
    expect(cam.centre[2]).toBeCloseTo(3.2, 2);
    expect(isUpright(cam)).toBe(true);
  });

  it("projects points above the floor correctly (net post tops)", () => {
    const post: Vec3 = [3.05, 0, 1.55];
    const a = project(cam, post)!;
    const b = project(truth, post)!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.5);
  });

  it("intersects pixel rays with horizontal planes", () => {
    const X: Vec3 = [-1.4, 3.3, 2.5];
    const px = project(truth, X)!;
    const back = pixelToPlane(cam, px, 2.5)!;
    expect(back[0]).toBeCloseTo(-1.4, 2);
    expect(back[1]).toBeCloseTo(3.3, 2);
  });

  it("flags a mirrored labelling as not upright", () => {
    const mirrored = COURT_CORNERS.map((p) => ({ x: -p.x, y: p.y }));
    const Hmir = estimateHomography(mirrored, COURT_CORNERS.map(floorToImage))!;
    expect(isUpright(cameraFromHomography(Hmir, W, H)!)).toBe(false);
  });

  it("falls back to a prior focal length for a top-down view", () => {
    const top = lookAt([0, -0.001, 20], [0, 0, 0], 900, W, H);
    const img = COURT_CORNERS.map((p) => project(top, [p.x, p.y, 0])!);
    const c = cameraFromHomography(estimateHomography(COURT_CORNERS, img)!, W, H)!;
    expect(c).not.toBeNull();
    expect(c.centre[2]).toBeGreaterThan(5);
  });
});

describe("court", () => {
  it("knows what is inside", () => {
    expect(insideCourt({ x: 2.8, y: 6 }, "doubles")).toBe(true);
    expect(insideCourt({ x: 2.8, y: 6 }, "singles")).toBe(false);
    expect(insideCourt({ x: 0, y: 6.9 }, "doubles", 0.25)).toBe(true);
  });
});
