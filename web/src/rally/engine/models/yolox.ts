/**
 * YOLOX (mmdeploy end2end export, NMS included) person detector.
 * Preprocessing matches mmdet/rtmlib: keep-ratio resize, top-left aligned,
 * pad value 114, BGR channel order, raw 0–255 (no normalisation).
 */
import { tensor, type InferenceSession, type Tensor } from "../runtime/types";

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
}

export interface LetterboxResult {
  input: Tensor;
  ratio: number;
}

type Canvas2D = OffscreenCanvasRenderingContext2D;

let scratch: { canvas: OffscreenCanvas; ctx: Canvas2D; size: number } | null = null;

function scratchCanvas(size: number) {
  if (!scratch || scratch.size !== size) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas unavailable");
    scratch = { canvas, ctx, size };
  }
  return scratch;
}

export function letterbox(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  size = 416,
): LetterboxResult {
  const { ctx } = scratchCanvas(size);
  const ratio = Math.min(size / srcW, size / srcH);
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(source, 0, 0, Math.round(srcW * ratio), Math.round(srcH * ratio));
  const { data } = ctx.getImageData(0, 0, size, size);
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0, p = 0; p < plane; i += 4, p++) {
    out[p] = data[i + 2]!; // B
    out[plane + p] = data[i + 1]!; // G
    out[2 * plane + p] = data[i]!; // R
  }
  return { input: tensor("float32", out, [1, 3, size, size]), ratio };
}

export async function detectPeople(
  session: InferenceSession,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  minScore = 0.35,
): Promise<Box[]> {
  const { input, ratio } = letterbox(source, srcW, srcH);
  const out = await session.run({ [session.inputNames[0]!]: input });
  const dets = out.dets ?? out[session.outputNames[0]!];
  const labels = out.labels ?? out[session.outputNames[1]!];
  if (!dets) return [];
  const d = dets.data as Float32Array;
  const n = dets.dims[1] ?? 0;
  const boxes: Box[] = [];
  for (let i = 0; i < n; i++) {
    const score = d[i * 5 + 4]!;
    const label = labels ? Number(labels.data[i]) : 0;
    if (label !== 0 || score < minScore) continue;
    boxes.push({
      x1: d[i * 5]! / ratio,
      y1: d[i * 5 + 1]! / ratio,
      x2: d[i * 5 + 2]! / ratio,
      y2: d[i * 5 + 3]! / ratio,
      score,
    });
  }
  return boxes;
}
