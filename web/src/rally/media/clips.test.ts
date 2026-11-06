import { describe, expect, it } from "vitest";
import type { PlayerTrack, Rally, Shot } from "../engine/types";
import { TRACK_HZ } from "../engine/types";
import { cameraPath, clipSegments, clock, outputSize, sameAspect, segmentsDuration, stamp } from "./clips";

const shot = (id: string, t: number, rallyId: string, extra: Partial<Shot> = {}): Shot =>
  ({ id, rallyId, t, hitter: "P1", type: "clear", deleted: false, ...extra }) as Shot;

const rallies: Rally[] = [
  { id: "r1", start: 2, end: 10, shotIds: ["a", "b"] },
  { id: "r2", start: 11.5, end: 15, shotIds: ["c"] },
  { id: "r3", start: 30, end: 40, shotIds: ["d", "e"] },
];
const shots = [shot("a", 2, "r1"), shot("b", 3, "r1"), shot("c", 12, "r2"), shot("d", 30, "r3"), shot("e", 38, "r3")];
const base = { rallies, shots, tracks: [] as PlayerTrack[], shuttle: [], video: { width: 1280, height: 720 } } as never;

describe("clipSegments", () => {
  it("whole video", () => {
    expect(clipSegments(base, { kind: "all" }, 60)).toEqual([{ start: 0, end: 60 }]);
  });
  it("pads rallies, merges ones that touch, cuts the dead time between the rest", () => {
    const segs = clipSegments(base, { kind: "rallies", ids: ["r1", "r2", "r3"] }, 41);
    expect(segs).toEqual([
      { start: 0.8, end: 16.5 },
      { start: 28.8, end: 41 },
    ]);
    expect(segmentsDuration(segs)).toBeCloseTo(15.7 + 12.2, 5);
  });
  it("one shot runs until just after the next hit", () => {
    expect(clipSegments(base, { kind: "shot", id: "a" }, 60)).toEqual([{ start: 0.5, end: 3.6 }]);
  });
  it("the last shot of a rally gets a fixed tail; deleted shots are skipped", () => {
    expect(clipSegments(base, { kind: "shot", id: "c" }, 60)).toEqual([{ start: 10.5, end: 14.5 }]);
    const withDeleted = {
      ...(base as object),
      shots: [shot("a", 2, "r1"), shot("x", 2.5, "r1", { deleted: true }), shot("b", 3, "r1")],
    } as never;
    expect(clipSegments(withDeleted, { kind: "shot", id: "a" }, 60)[0]!.end).toBeCloseTo(3.6, 5);
  });
});

describe("output", () => {
  it("sizes", () => {
    expect(outputSize("vertical", 1920, 1080)).toEqual({ width: 720, height: 1280 });
    expect(outputSize("landscape", 1280, 720)).toEqual({ width: 1280, height: 720 });
    expect(sameAspect("landscape", 1920, 1080)).toBe(true);
    expect(sameAspect("vertical", 1920, 1080)).toBe(false);
    expect(sameAspect("vertical", 1080, 1920)).toBe(true);
  });
  it("clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(61.9)).toBe("1:01");
    expect(stamp(7.62)).toBe("0:07.6");
    expect(stamp(59.96)).toBe("1:00.0");
  });
});

describe("cameraPath", () => {
  // P1 walks from x=200 to x=1000 over 4 s, then stays.
  const n = 8 * TRACK_HZ;
  const boxes: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / TRACK_HZ;
    const cx = 200 + 800 * Math.min(1, t / 4);
    boxes.push(cx - 30, 300, cx + 30, 500);
  }
  const tracks: PlayerTrack[] = [{ id: "P1", t0: 0, court: [], boxes }];
  const r = { ...(base as object), tracks } as never;
  const seg = [{ start: 0, end: 7.9 }];

  it("follows the player inside the frame, without jumps", () => {
    const cam = cameraPath(r, { kind: "player", id: "P1" }, seg, "vertical");
    const w = 720 * (9 / 16);
    let prev = cam(0).x;
    for (let t = 0; t <= 7.9; t += 1 / 30) {
      const c = cam(t);
      expect(c.w).toBeCloseTo(w, 5);
      expect(c.h).toBe(720);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1280 + 1e-6);
      expect(Math.abs(c.x - prev)).toBeLessThan((0.9 * w) / 30 + 1);
      prev = c.x;
    }
    // Settled on the player at the end.
    const end = cam(7.5);
    expect(end.x + end.w / 2).toBeGreaterThan(950);
    // And the start keeps the player in view.
    const start = cam(0);
    expect(200).toBeGreaterThan(start.x);
    expect(200).toBeLessThan(start.x + start.w);
  });

  it("action framing falls back to the players when the shuttle isn't seen", () => {
    const cam = cameraPath(r, { kind: "action" }, seg, "vertical");
    const end = cam(7.5);
    expect(end.x + end.w / 2).toBeGreaterThan(900);
  });
});
