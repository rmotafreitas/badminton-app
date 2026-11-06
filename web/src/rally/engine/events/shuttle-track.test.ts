import { describe, expect, it } from "vitest";
import { cleanShuttleTrack } from "./shuttle-track";
import type { ShuttleSample } from "../types";

const FPS = 30;
const opts = { fps: FPS, diagonal: Math.hypot(1280, 720) };

describe("shuttle track cleaning", () => {
  it("drops a slowly crawling false positive but keeps a flight interleaved with it", () => {
    const track: ShuttleSample[] = [];
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 6;
    for (let i = 0; i < 3 * FPS; i++) {
      const t = 10 + i / FPS;
      // A white shoe drifting ~10 px/s with detection jitter.
      track.push({ t, x: 340 + 10 * (t - 10) + rnd(), y: 555 + rnd(), conf: 0.7 });
      // A real 0.4 s flight in the middle.
      if (t > 11 && t < 11.4) track.push({ t: t + 0.001, x: 420 + 600 * (t - 11), y: 420 + 300 * (t - 11), conf: 0.9 });
    }
    track.sort((a, b) => a.t - b.t);
    const clean = cleanShuttleTrack(track, opts);
    expect(clean.filter((s) => s.y > 540).length).toBeLessThan(10);
    expect(clean.filter((s) => s.conf === 0.9).length).toBeGreaterThan(8);
  });

  it("keeps a high clear's slow apex", () => {
    const track: ShuttleSample[] = [];
    for (let i = 0; i < 1.6 * FPS; i++) {
      const t = i / FPS;
      // Parabola in image space: slow near the apex at t = 0.8 s.
      track.push({ t, x: 400 + 150 * t, y: 600 - 900 * t + 560 * t * t, conf: 0.9 });
    }
    expect(cleanShuttleTrack(track, opts).length).toBe(track.length);
  });
});
