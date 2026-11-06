import { describe, expect, it } from "vitest";
import { distanceCovered, inferFormat, positionAt, trackPlayers, type FrameDetections } from "./player-tracker";
import type { Vec2 } from "../geometry/linalg";

// Identity-ish mapping: image px = court metres × 100 + offset (keeps tests readable).
const toImage = (p: Vec2) => ({ x: p.x * 100 + 500, y: p.y * 100 + 1000 });
const toCourt = (p: Vec2) => ({ x: (p.x - 500) / 100, y: (p.y - 1000) / 100 });

function box(p: Vec2, score = 0.9) {
  const f = toImage(p);
  return { x1: f.x - 30, y1: f.y - 170, x2: f.x + 30, y2: f.y, score };
}

/** Players moving on known paths; detections with jitter and dropouts. */
function scenario(paths: ((t: number) => Vec2)[], seconds: number, fps = 30, extras: Vec2[] = []) {
  const frames: FrameDetections[] = [];
  let seed = 3;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < seconds * fps; i++) {
    const t = i / fps;
    const boxes = paths
      .map((path) => path(t))
      .filter(() => rnd() > 0.08) // 8 % missed detections
      .map((p) => box({ x: p.x + (rnd() - 0.5) * 0.06, y: p.y + (rnd() - 0.5) * 0.06 }));
    boxes.push(...extras.map((p) => box(p, 0.8)));
    frames.push({ t, boxes });
  }
  return frames;
}

describe("player tracker", () => {
  it("infers formats", () => {
    expect(inferFormat(1, 1)).toBe("singles");
    expect(inferFormat(2, 2)).toBe("doubles");
    expect(inferFormat(2, 1)).toBe("practice");
  });

  it("tracks doubles with stable labels and ignores spectators", () => {
    const paths = [
      (t: number) => ({ x: -1.5 + 0.5 * Math.sin(t), y: -3 }), // near left
      (t: number) => ({ x: 1.5, y: -4 + Math.sin(t * 0.7) }), // near right
      (t: number) => ({ x: -1.2, y: 3 + 0.8 * Math.sin(t * 1.3) }), // far left
      (t: number) => ({ x: 1.4 + 0.3 * Math.cos(t), y: 4.5 }), // far right
    ];
    const spectators = [{ x: 6, y: 0 }, { x: -2, y: 11 }];
    const r = trackPlayers(scenario(paths, 20, 30, spectators), { toCourt });
    expect(r.format).toBe("doubles");
    expect(r.players.map((p) => `${p.id}${p.side}`)).toEqual(["P1-1", "P2-1", "P31", "P41"]);
    // Labels stay on their person: compare with ground truth at several times.
    for (const t of [2, 7.3, 13, 19]) {
      r.tracks.forEach((tr, i) => {
        const p = positionAt(tr, t)!;
        const truth = paths[i]!(t);
        expect(Math.hypot(p.x - truth.x, p.y - truth.y)).toBeLessThan(0.3);
      });
    }
  });

  it("ignores a spectator sitting just inside the far baseline", () => {
    const paths = [
      (t: number) => ({ x: -1.5 + 0.5 * Math.sin(t), y: -3 }),
      (t: number) => ({ x: 1.5, y: -4 + Math.sin(t * 0.7) }),
      (t: number) => ({ x: -1.2, y: 3 + 0.8 * Math.sin(t * 1.3) }),
      (t: number) => ({ x: 1.4 + 0.3 * Math.cos(t), y: 4.5 }),
    ];
    const r = trackPlayers(scenario(paths, 20, 30, [{ x: 0.8, y: 6.2 }]), { toCourt });
    expect(r.format).toBe("doubles");
    expect(r.players.length).toBe(4);
  });

  it("keeps every slot alive when initialised away from the first detection", () => {
    // Regression: a slot initialised at a tracklet's first point and corrected
    // on frame 0 must not get a runaway velocity (dt ≈ 0).
    const paths = [
      (t: number) => ({ x: -2 + 0.2 * t, y: -2 }),
      (t: number) => ({ x: t < 0.05 ? -0.6 : 0.2, y: t < 0.05 ? -2.1 : -3.4 }),
      (t: number) => ({ x: -1, y: 3 + Math.sin(t) }),
      () => ({ x: 1.2, y: 4 }),
    ];
    const r = trackPlayers(scenario(paths, 10), { toCourt, format: "doubles" });
    for (const tr of r.tracks) {
      const valid = tr.court.filter((v, i) => i % 2 === 0 && !Number.isNaN(v)).length;
      expect(valid / (tr.court.length / 2)).toBeGreaterThan(0.8);
    }
  });

  it("detects a practice session (1 feeder vs 2 players)", () => {
    const paths = [
      (t: number) => ({ x: -1 + Math.sin(t), y: -3 }),
      (t: number) => ({ x: 1.2, y: -3.5 + Math.sin(t) }),
      () => ({ x: 0, y: 2 }),
    ];
    const r = trackPlayers(scenario(paths, 10), { toCourt });
    expect(r.format).toBe("practice");
    expect(r.players.length).toBe(3);
  });

  it("measures distance covered within 10 %", () => {
    // Shuttle run: 3 m back and forth, 10 times in 30 s → 60 m.
    const path = (t: number) => {
      const phase = (t % 3) / 3;
      const y = -2 - 3 * (phase < 0.5 ? phase * 2 : 2 - phase * 2);
      return { x: 0, y };
    };
    const r = trackPlayers(scenario([path, () => ({ x: 0, y: 3 })], 30), { toCourt });
    const d = distanceCovered(r.tracks[0]!);
    expect(d).toBeGreaterThan(54);
    expect(d).toBeLessThan(66);
    // A standing player covers ~nothing despite jitter.
    expect(distanceCovered(r.tracks[1]!)).toBeLessThan(3);
  });
});
