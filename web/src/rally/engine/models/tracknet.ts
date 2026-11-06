/**
 * TrackNetV3 shuttle detector.
 * Input: [1, 27, 288, 512] = background median (RGB) + 8 consecutive frames
 * (RGB), each /255, CHW. Output: [1, 8, 288, 512] sigmoid heatmaps.
 */
import { tensor, type InferenceSession, type Tensor } from "../runtime/types";

export const TN_W = 512;
export const TN_H = 288;
export const TN_SEQ = 8;
const PLANE = TN_W * TN_H;

export interface ShuttlePoint {
  /** Position in TrackNet input pixels (512×288). */
  x: number;
  y: number;
  /** Peak heatmap value, 0–1. */
  conf: number;
}

/** RGBA pixels of one 512×288 frame. */
export type RgbaFrame = Uint8ClampedArray;

/** Per-pixel median of sampled frames — the static background. */
export function medianBackground(samples: readonly RgbaFrame[]): Uint8ClampedArray {
  const n = samples.length;
  const out = new Uint8ClampedArray(PLANE * 4);
  const buf = new Uint8Array(n);
  const mid = n >> 1;
  for (let i = 0; i < PLANE * 4; i++) {
    if ((i & 3) === 3) {
      out[i] = 255;
      continue;
    }
    for (let k = 0; k < n; k++) buf[k] = samples[k]![i]!;
    buf.sort();
    out[i] = buf[mid]!;
  }
  return out;
}

export function buildInput(median: RgbaFrame, frames: readonly RgbaFrame[]): Tensor {
  if (frames.length !== TN_SEQ) throw new Error(`TrackNet needs ${TN_SEQ} frames`);
  const out = new Float32Array(27 * PLANE);
  const write = (img: RgbaFrame, slot: number) => {
    const base = slot * 3 * PLANE;
    for (let i = 0, p = 0; p < PLANE; i += 4, p++) {
      out[base + p] = img[i]! / 255;
      out[base + PLANE + p] = img[i + 1]! / 255;
      out[base + 2 * PLANE + p] = img[i + 2]! / 255;
    }
  };
  write(median, 0);
  frames.forEach((f, k) => write(f, k + 1));
  return tensor("float32", out, [1, 27, TN_H, TN_W]);
}

/** Peak of each heatmap (argmax). Below `threshold` → null (not visible). */
export function decodeHeatmaps(heatmaps: Tensor, threshold = 0.5): (ShuttlePoint | null)[] {
  const d = heatmaps.data as Float32Array;
  const points: (ShuttlePoint | null)[] = [];
  for (let k = 0; k < TN_SEQ; k++) {
    let best = 0;
    let bestIdx = -1;
    const base = k * PLANE;
    for (let p = 0; p < PLANE; p++) {
      const v = d[base + p]!;
      if (v > best) {
        best = v;
        bestIdx = p;
      }
    }
    points.push(
      best >= threshold ? { x: bestIdx % TN_W, y: Math.floor(bestIdx / TN_W), conf: best } : null,
    );
  }
  return points;
}

export async function detectShuttle(
  session: InferenceSession,
  median: RgbaFrame,
  frames: readonly RgbaFrame[],
): Promise<(ShuttlePoint | null)[]> {
  const out = await session.run({ [session.inputNames[0]!]: buildInput(median, frames) });
  return decodeHeatmaps(out[session.outputNames[0]!]!);
}
