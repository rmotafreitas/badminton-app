import { describe, expect, it } from "vitest";
import { cameraFromHomography, project } from "../geometry/camera";
import { COURT_CORNERS } from "../geometry/court";
import { estimateHomography } from "../geometry/homography";
import { applyH, cross3, mat3Inv, norm3, scale3, sub3, type Mat3, type Vec2, type Vec3 } from "../geometry/linalg";
import { simulate, type FlightState } from "../physics/shuttle-flight";
import { trackPlayers, type FrameDetections } from "../tracking/player-tracker";
import { applyCorrections, computeStats } from "../stats";
import type { PlayerId, ShotType, ShuttleSample } from "../types";
import { cleanShuttleTrack } from "./shuttle-track";
import { buildShots, classify, classifyFromContext } from "./shots";

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

const W = 1280;
const H = 720;
const FPS = 30;
const truth = lookAt([0.5, -10.5, 3.2], [0, 0.5, 0.9], 950, W, H);

interface ScriptShot {
  hitter: PlayerId;
  type: ShotType;
  /** Where (and when) the shuttle should be met next — or land, for the last shot. */
  target: Vec3;
  T: number;
}

/** Launch velocity that reaches `target` after T seconds (shooting method). */
function aim(p: Vec3, target: Vec3, T: number): Vec3 {
  let v: Vec3 = [(target[0] - p[0]) / T, (target[1] - p[1]) / T, (target[2] - p[2]) / T + 4.9 * T];
  for (let i = 0; i < 60; i++) {
    const [e] = simulate({ p, v }, [T]);
    v = [v[0] + (target[0] - e![0]) / T, v[1] + (target[1] - e![1]) / T, v[2] + (target[2] - e![2]) / T];
  }
  return v;
}

/** Builds a rally: each shot starts where the previous one was received. */
function makeRally(start: Vec3, script: ScriptShot[], t0: number) {
  const contacts: { t: number; p: Vec3; v: Vec3; hitter: PlayerId }[] = [];
  const samples: { t: number; p: Vec3 }[] = [];
  let p = start;
  let t = t0;
  for (const s of script) {
    const v = aim(p, s.target, s.T);
    contacts.push({ t, p, v, hitter: s.hitter });
    const times = Array.from({ length: Math.round(s.T * 120) }, (_, i) => (i + 1) / 120);
    simulate({ p, v } as FlightState, times).forEach((q, i) => samples.push({ t: t + times[i]!, p: q }));
    p = s.target;
    t += s.T;
  }
  return { contacts, samples, end: t };
}

describe("rally pipeline on a synthetic doubles rally", () => {
  const home: Record<PlayerId, Vec2> = {
    P1: { x: -1.3, y: -3.6 },
    P2: { x: 1.4, y: -2.6 },
    P3: { x: -1.1, y: 3.0 },
    P4: { x: 1.3, y: 4.4 },
    P5: { x: 0, y: 0 },
    P6: { x: 0, y: 0 },
  };
  const script: ScriptShot[] = [
    { hitter: "P1", type: "serve", target: [-1.0, 2.8, 1.3], T: 0.9 },
    { hitter: "P3", type: "lift", target: [-1.2, -4.6, 2.5], T: 1.5 },
    { hitter: "P1", type: "smash", target: [1.2, 3.6, 0.8], T: 0.35 },
    { hitter: "P4", type: "drive", target: [1.3, -2.8, 1.9], T: 0.45 },
    { hitter: "P2", type: "clear", target: [-0.9, 5.2, 2.6], T: 1.4 },
    { hitter: "P3", type: "drop", target: [0.4, -2.2, 0], T: 1.0 },
  ];
  const rally = makeRally([-1.3, -2.3, 1.1], script, 2);

  // Each hitter walks to the contact point before hitting and back after.
  function playerPos(id: PlayerId, t: number): Vec2 {
    const mine = rally.contacts.filter((c) => c.hitter === id);
    let best = home[id];
    for (const c of mine) {
      const d = Math.abs(t - c.t);
      if (d < 0.6) {
        const w = 1 - d / 0.6;
        best = { x: home[id].x + w * (c.p[0] - home[id].x), y: home[id].y + w * (c.p[1] - home[id].y) };
      }
    }
    return best;
  }

  let seed = 11;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };

  const frames: FrameDetections[] = [];
  const shuttle: ShuttleSample[] = [];
  const total = rally.end + 2;
  for (let i = 0; i < total * FPS; i++) {
    const t = i / FPS;
    frames.push({
      t,
      boxes: (["P1", "P2", "P3", "P4"] as PlayerId[]).map((id) => {
        const p = playerPos(id, t);
        const foot = project(truth, [p.x, p.y, 0])!;
        const head = project(truth, [p.x, p.y, 1.75])!;
        const h = foot.y - head.y;
        return { x1: foot.x - 0.2 * h, y1: head.y, x2: foot.x + 0.2 * h, y2: foot.y, score: 0.9 };
      }),
    });
    const s = rally.samples.find((q) => Math.abs(q.t - t) < 1 / 240);
    if (s && rnd() > -0.45) {
      const px = project(truth, s.p)!;
      shuttle.push({ t, x: px.x + rnd() * 2, y: px.y + rnd() * 2, conf: 0.9 });
    }
  }
  // A static false positive (e.g. a light) the cleaner must remove.
  for (let i = 0; i < total * FPS; i += 1) shuttle.push({ t: i / FPS + 1e-4, x: 100, y: 80, conf: 0.7 });
  shuttle.sort((a, b) => a.t - b.t);

  // Calibrate from the floor only, like the app.
  const Hm = estimateHomography(COURT_CORNERS, COURT_CORNERS.map((p) => project(truth, [p.x, p.y, 0])!))!;
  const cam = cameraFromHomography(Hm, W, H)!;
  const Hinv = mat3Inv(Hm)!;

  const tracked = trackPlayers(frames, { toCourt: (p) => applyH(Hinv, p) });
  const track = cleanShuttleTrack(shuttle, { fps: FPS, diagonal: Math.hypot(W, H) });
  const sides = Object.fromEntries(tracked.players.map((p) => [p.id, p.side]));
  const { rallies, shots } = buildShots({ track, tracks: tracked.tracks, sides, camera: cam, fps: FPS });

  it("labels the four players", () => {
    expect(tracked.format).toBe("doubles");
  });

  it("removes the static false positive", () => {
    expect(track.some((s) => s.x === 100 && s.y === 80)).toBe(false);
  });

  it("finds one rally with every hit and the right hitters", () => {
    expect(rallies.length).toBe(1);
    expect(shots.map((s) => s.hitter)).toEqual(script.map((s) => s.hitter));
    shots.forEach((s, i) => expect(Math.abs(s.t - rally.contacts[i]!.t)).toBeLessThan(0.1));
  });

  it("types most shots correctly", () => {
    const correct = shots.filter((s, i) => s.type === script[i]!.type).length;
    expect(correct).toBeGreaterThanOrEqual(5);
  });

  it("estimates the smash speed within 15 %", () => {
    const smash = shots[2]!;
    const trueKmh = Math.hypot(...rally.contacts[2]!.v) * 3.6;
    expect(smash.speedKmh).not.toBeNull();
    expect(Math.abs(smash.speedKmh! - trueKmh) / trueKmh).toBeLessThan(0.15);
    expect(smash.speedConfidence).toBe("high");
  });

  it("applies corrections and recomputes stats", () => {
    const result = {
      version: 1 as const,
      createdAt: "",
      engine: { runtime: "", backend: "", models: [] },
      video: { width: W, height: H, fps: FPS, durationS: total, analysedFps: FPS },
      format: tracked.format,
      calibration: null,
      players: tracked.players,
      tracks: tracked.tracks,
      shuttle: track,
      rallies,
      shots,
      stats: computeStats({ ...tracked, shots, rallies }),
    };
    const fixed = applyCorrections(result, {
      shots: { [shots[1]!.id]: { type: "clear" }, [shots[5]!.id]: { deleted: true } },
    });
    expect(fixed.shots[1]!.reviewed).toBe(true);
    expect(fixed.stats.shots).toBe(5);
    const p3 = fixed.stats.players.find((p) => p.id === "P3")!;
    expect(p3.shotsByType.clear).toBe(1);
    expect(p3.distanceM).toBeGreaterThan(0);
  });
});

describe("classifyFromContext", () => {
  it("gives sensible low-confidence guesses without physics", () => {
    expect(classifyFromContext({ first: false, flightTime: 1.5, hitterY: -5.5, receiverY: 5 })).toBe("clear");
    expect(classifyFromContext({ first: false, flightTime: 1.4, hitterY: -1.5, receiverY: 5.5 })).toBe("lift");
    expect(classifyFromContext({ first: false, flightTime: 0.6, hitterY: -4.5, receiverY: 2 })).toBe("smash");
    expect(classifyFromContext({ first: false, flightTime: 0.7, hitterY: -1.8, receiverY: 2 })).toBe("net");
  });
});

describe("classify", () => {
  it("knows a smash and a net shot", () => {
    expect(
      classify({ first: false, hitterY: -4, contactHeight: 2.6, launchVz: -6, speed: 30, apex: 2.6, landingY: 3 })
        .type,
    ).toBe("smash");
    expect(
      classify({ first: false, hitterY: -1.5, contactHeight: 1.2, launchVz: 1, speed: 6, apex: 1.7, landingY: 1.2 })
        .type,
    ).toBe("net");
  });
});
