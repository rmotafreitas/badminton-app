import { describe, expect, it } from "vitest";
import { cameraFromHomography, project } from "../geometry/camera";
import { COURT_CORNERS } from "../geometry/court";
import { estimateHomography } from "../geometry/homography";
import { cross3, norm3, scale3, sub3, type Mat3, type Vec3 } from "../geometry/linalg";
import { fitFlight, simulate, summarise, type FlightState, type Observation } from "./shuttle-flight";

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

// Deterministic pseudo-random noise.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

describe("shuttle flight model", () => {
  it("decelerates towards terminal velocity", () => {
    const st: FlightState = { p: [0, 0, 30], v: [0, 0, 0] };
    const [, p2] = simulate(st, [1.99, 2]);
    const [p1] = simulate(st, [1.99]);
    const vz = (p2![2] - p1![2]) / 0.01;
    expect(Math.abs(vz)).toBeGreaterThan(6.2);
    expect(Math.abs(vz)).toBeLessThan(6.75);
  });

  it("a 100 km/h clear does not leave the hall", () => {
    const s = summarise({ p: [0, -5.5, 2.4], v: [0, 20, 18] });
    expect(s.landing).not.toBeNull();
    expect(s.landing!.y).toBeGreaterThan(3);
    expect(s.landing!.y).toBeLessThan(10);
    expect(s.apexHeight).toBeGreaterThan(5);
    expect(s.flightTime).toBeGreaterThan(1.5);
  });
});

describe("monocular trajectory fit", () => {
  const W = 1280;
  const H = 720;
  const truth = lookAt([0.8, -11, 3.5], [0, 0, 1], 980, W, H);
  // Calibrate exactly as the app would: from the floor homography only.
  const Hm = estimateHomography(
    COURT_CORNERS,
    COURT_CORNERS.map((p) => project(truth, [p.x, p.y, 0])!),
  )!;
  const cam = cameraFromHomography(Hm, W, H)!;

  function observe(start: FlightState, n: number, fps: number, noisePx: number, seed = 7) {
    const times = Array.from({ length: n }, (_, i) => (i + 1) / fps);
    const noise = rng(seed);
    return simulate(start, times).map(
      (p, i): Observation => {
        const px = project(truth, p)!;
        return { t: times[i]!, px: { x: px.x + noise() * 2 * noisePx, y: px.y + noise() * 2 * noisePx } };
      },
    );
  }

  const cases: { name: string; start: FlightState; towards: 1 | -1 }[] = [
    { name: "near-court smash", start: { p: [0.6, -4.5, 2.7], v: [-1, 24, -8] }, towards: 1 },
    { name: "far-court clear", start: { p: [-1, 5, 2.5], v: [0.5, -18, 14] }, towards: -1 },
    { name: "near-court drive", start: { p: [1.2, -2.5, 1.3], v: [-0.8, 17, 1.5] }, towards: 1 },
  ];

  for (const c of cases) {
    const trueSpeed = Math.hypot(...c.start.v);
    const truth3 = summarise(c.start);
    const prior = {
      p: [c.start.p[0] + 0.2, c.start.p[1] - 0.25, 2.2] as Vec3,
      sigma: [0.5, 0.5, 0.7] as Vec3,
      towardsY: c.towards,
    };

    it(`${c.name}: 12 frames + receiver contact → speed within 15%`, () => {
      // Receiver meets the shuttle 75% of the way through its flight.
      const tEnd = truth3.flightTime * 0.75;
      const [pe] = simulate(c.start, [tEnd]);
      const fit = fitFlight(cam, observe(c.start, 12, 60, 1.5), {
        ...prior,
        end: { t: tEnd, p: [pe![0] + 0.3, pe![1] - 0.3, pe![2] + 0.3], sigma: [0.5, 0.5, 0.6] },
      })!;
      expect(Math.abs(fit.speed - trueSpeed) / trueSpeed).toBeLessThan(0.15);
      expect(fit.rmsPx).toBeLessThan(3);
    });

    it(`${c.name}: whole visible flight → speed within 15%, landing within 0.8 m`, () => {
      const n = Math.floor(truth3.flightTime * 60) - 6;
      const fit = fitFlight(cam, observe(c.start, n, 60, 1.5), prior)!;
      expect(Math.abs(fit.speed - trueSpeed) / trueSpeed).toBeLessThan(0.15);
      const d = Math.hypot(fit.summary.landing!.x - truth3.landing!.x, fit.summary.landing!.y - truth3.landing!.y);
      expect(d).toBeLessThan(0.8);
    });
  }

  it("is honest when only 12 frames exist: fit is consistent with the pixels", () => {
    const c = cases[1]!;
    const fit = fitFlight(cam, observe(c.start, 12, 60, 1.5), {
      p: [c.start.p[0], c.start.p[1], 2.2],
      sigma: [0.5, 0.5, 0.7],
      towardsY: c.towards,
    })!;
    expect(fit.rmsPx).toBeLessThan(3);
  });
});
