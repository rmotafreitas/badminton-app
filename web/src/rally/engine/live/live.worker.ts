/// <reference lib="webworker" />
/**
 * Live preview worker: person detection on camera frames, plus a periodic
 * setup check — court detection on a rolling median (players removed), light
 * level and camera stability.
 */
import { hasWebGpu, ortJsepRuntime } from "../runtime/ort-runtime";
import { fetchModel } from "../models/registry";
import { detectPeople, type Box } from "../models/yolox";
import { detectCourt, toGray } from "../geometry/court-detect";
import type { InferenceSession } from "../runtime/types";
import type { Vec2 } from "../geometry/linalg";

declare const self: DedicatedWorkerGlobalScope;

export type LiveRequest =
  { type: "init" } | { type: "frame"; bitmap: ImageBitmap; sample: boolean } | { type: "detect-court" };

export interface LiveCheck {
  /** Corners in frame px (near-left, near-right, far-right, far-left), or null. */
  corners: [Vec2, Vec2, Vec2, Vec2] | null;
  courtScore: number;
  /** Mean luminance 0–255. */
  light: number;
  /** 0 (shaky) – 1 (rock solid). */
  stability: number;
}

export type LiveResponse =
  | { type: "ready"; backend: string }
  | { type: "error"; message: string }
  | { type: "boxes"; boxes: Box[]; ms: number; width: number; height: number }
  | { type: "check"; check: LiveCheck };

let person: InferenceSession | null = null;
const samples: Uint8ClampedArray[] = [];
const feet: Vec2[] = [];
let sampleW = 0;
let sampleH = 0;
let prevGray: Uint8Array | null = null;
let stability = 1;
let light = 128;

// Same scale as the analysis court check (autoCalibrate): at 480 px the court
// lines get too thin and detection scores drop below the threshold.
const SAMPLE_LONG = 640;
const MAX_SAMPLES = 9;

function post(m: LiveResponse) {
  self.postMessage(m);
}

function sampleFrame(bitmap: ImageBitmap) {
  const s = SAMPLE_LONG / Math.max(bitmap.width, bitmap.height);
  sampleW = Math.round(bitmap.width * s);
  sampleH = Math.round(bitmap.height * s);
  const c = new OffscreenCanvas(sampleW, sampleH);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, sampleW, sampleH);
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
  samples.push(new Uint8ClampedArray(data));
  if (samples.length > MAX_SAMPLES) samples.shift();

  // Light + stability (median block difference vs previous sample: players
  // change a few blocks, a moving phone changes all of them).
  const gray = toGray(data, sampleW, sampleH).data;
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i]!;
  light = sum / gray.length;
  if (prevGray && prevGray.length === gray.length) {
    const B = 8;
    const bw = Math.floor(sampleW / B);
    const bh = Math.floor(sampleH / B);
    const diffs: number[] = [];
    for (let by = 0; by < B; by++)
      for (let bx = 0; bx < B; bx++) {
        let d = 0;
        for (let y = by * bh; y < (by + 1) * bh; y += 2)
          for (let x = bx * bw; x < (bx + 1) * bw; x += 2) {
            const i = y * sampleW + x;
            d += Math.abs(gray[i]! - prevGray[i]!);
          }
        diffs.push(d / ((bw * bh) / 4));
      }
    diffs.sort((a, b) => a - b);
    const med = diffs[diffs.length >> 1]!;
    const instant = Math.max(0, Math.min(1, 1 - (med - 3) / 12));
    stability = 0.6 * stability + 0.4 * instant;
  }
  prevGray = gray;
}

function median(): Uint8ClampedArray | null {
  if (samples.length < 3) return null;
  const n = samples.length;
  const out = new Uint8ClampedArray(samples[0]!.length);
  const buf = new Uint8Array(n);
  for (let i = 0; i < out.length; i++) {
    if ((i & 3) === 3) {
      out[i] = 255;
      continue;
    }
    for (let k = 0; k < n; k++) buf[k] = samples[k]![i]!;
    buf.sort();
    out[i] = buf[n >> 1]!;
  }
  return out;
}

function courtCheck(): LiveCheck {
  const med = median();
  let corners: LiveCheck["corners"] = null;
  let courtScore = 0;
  if (med) {
    const det = detectCourt(toGray(med, sampleW, sampleH), { feet });
    if (det && det.score >= 0.55) {
      corners = det.corners;
      courtScore = det.score;
    }
  }
  return { corners, courtScore, light, stability };
}

self.onmessage = async (ev: MessageEvent<LiveRequest>) => {
  const m = ev.data;
  try {
    if (m.type === "init") {
      const backend = (await hasWebGpu()) ? "webgpu" : "wasm";
      person = await ortJsepRuntime.createSession(await fetchModel("yolox-tiny-person"), { backend });
      post({ type: "ready", backend });
    } else if (m.type === "frame") {
      const { bitmap } = m;
      if (m.sample) sampleFrame(bitmap);
      if (person) {
        const t = performance.now();
        const boxes = await detectPeople(person, bitmap, bitmap.width, bitmap.height);
        // Feet in sample-space for court detection evidence.
        const s = sampleW ? sampleW / bitmap.width : 0;
        if (s) {
          for (const b of boxes) feet.push({ x: ((b.x1 + b.x2) / 2) * s, y: b.y2 * s });
          if (feet.length > 120) feet.splice(0, feet.length - 120);
        }
        post({ type: "boxes", boxes, ms: performance.now() - t, width: bitmap.width, height: bitmap.height });
      } else {
        // Model still loading (or failed): always answer, or the page — which
        // sends one frame at a time — would wait for this reply forever.
        post({ type: "boxes", boxes: [], ms: 0, width: bitmap.width, height: bitmap.height });
      }
      bitmap.close();
    } else if (m.type === "detect-court") {
      const check = courtCheck();
      // Corners back to full-frame px happen on the main thread (scale known there).
      post({ type: "check", check: { ...check, corners: check.corners } });
    }
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};

export const LIVE_SAMPLE_LONG = SAMPLE_LONG;
