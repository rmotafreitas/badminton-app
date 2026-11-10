/**
 * Model catalogue. Weights are produced by tools/models/ (export scripts) and
 * served from MODEL_BASE_URL (default `/models/`, i.e. web/public/models). Only
 * the models the app itself runs are committed (tracknetv3_fp16, yolox_tiny);
 * the lab-only ones stay local.
 */

export type ModelId =
  | "yolox-tiny-person"
  | "rtmpose-s"
  | "rtmo-s"
  | "tracknetv3"
  | "tracknetv3-fp16"
  | "inpaintnet";

export interface ModelSpec {
  id: ModelId;
  file: string;
  task: "person-detection" | "pose-topdown" | "pose-bottomup" | "shuttle" | "trajectory-inpaint";
  /** NCHW (or model-specific) input dims used for benchmarking with synthetic input. */
  inputs: Record<string, readonly number[]>;
  license: string;
  source: string;
}

export const MODEL_BASE_URL: string =
  (import.meta.env.VITE_MODEL_BASE_URL as string | undefined) ?? "/models/";

export const MODELS: Record<ModelId, ModelSpec> = {
  "yolox-tiny-person": {
    id: "yolox-tiny-person",
    file: "yolox_tiny_humanart.onnx",
    task: "person-detection",
    inputs: { input: [1, 3, 416, 416] },
    license: "Apache-2.0 (MMPose/MMDet)",
    source: "openmmlab rtmposev1 onnx_sdk yolox_tiny_8xb8-300e_humanart",
  },
  "rtmpose-s": {
    id: "rtmpose-s",
    file: "rtmpose_s_body7.onnx",
    task: "pose-topdown",
    inputs: { input: [1, 3, 256, 192] },
    license: "Apache-2.0 (MMPose)",
    source: "openmmlab rtmpose-s_simcc-body7 256x192",
  },
  "rtmo-s": {
    id: "rtmo-s",
    file: "rtmo_s_body7.onnx",
    task: "pose-bottomup",
    inputs: { input: [1, 3, 640, 640] },
    license: "Apache-2.0 (MMPose)",
    source: "openmmlab rtmo-s_8xb32-600e_body7-640x640",
  },
  tracknetv3: {
    id: "tracknetv3",
    file: "tracknetv3.onnx",
    task: "shuttle",
    inputs: { frames: [1, 27, 288, 512] },
    license: "MIT (qaz812345/TrackNetV3)",
    source: "TrackNet_best.pt exported, seq_len=8, bg_mode=concat",
  },
  "tracknetv3-fp16": {
    id: "tracknetv3-fp16",
    file: "tracknetv3_fp16.onnx",
    task: "shuttle",
    inputs: { frames: [1, 27, 288, 512] },
    license: "MIT (qaz812345/TrackNetV3)",
    source: "tracknetv3.onnx converted to fp16 weights (fp32 I/O)",
  },
  inpaintnet: {
    id: "inpaintnet",
    file: "inpaintnet.onnx",
    task: "trajectory-inpaint",
    inputs: { coords: [1, 16, 2], mask: [1, 16, 1] },
    license: "MIT (qaz812345/TrackNetV3)",
    source: "InpaintNet_best.pt exported, seq_len=16",
  },
};

const MODEL_CACHE = "rally-models-v2";

/** The models the app runs (analysis and the live preview); the others are lab-only. */
export const APP_MODELS: readonly ModelId[] = ["tracknetv3-fp16", "yolox-tiny-person"];
/** Their combined download size, shown before the first download. */
export const APP_MODELS_BYTES = 22_687_473 + 20_283_006;

/** True when every app model is already stored on this device. */
export async function appModelsCached(): Promise<boolean> {
  try {
    const cache = await caches.open(MODEL_CACHE);
    const hits = await Promise.all(APP_MODELS.map((id) => cache.match(modelUrl(id))));
    return hits.every(Boolean);
  } catch {
    return false;
  }
}

/** Stores the app models on this device ahead of the first analysis; `onProgress` gets 0–1. */
export async function downloadAppModels(onProgress: (fraction: number) => void): Promise<void> {
  const loaded = new Map<ModelId, number>();
  const report = () => onProgress(Math.min(1, [...loaded.values()].reduce((a, b) => a + b, 0) / APP_MODELS_BYTES));
  await Promise.all(
    APP_MODELS.map((id) =>
      fetchModel(id, (n) => {
        loaded.set(id, n);
        report();
      }),
    ),
  );
}

export function modelUrl(id: ModelId): string {
  return MODEL_BASE_URL + MODELS[id].file;
}

/**
 * Fetches model bytes, using the Cache Storage API so models download once
 * per device (they are 5–45MB each).
 */
export async function fetchModel(
  id: ModelId,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const url = modelUrl(id);
  let cached: Response | undefined;
  try {
    // v1 could hold the SPA's index.html saved as a model; drop it.
    void caches.delete("rally-models-v1").catch(() => undefined);
    const cache = await caches.open(MODEL_CACHE);
    cached = await cache.match(url);
    if (cached) return await cached.arrayBuffer();
  } catch {
    // Cache Storage can be unavailable (private mode); fall through to network.
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Model ${id}: HTTP ${res.status}`);
  if (res.headers.get("content-type")?.includes("text/html")) throw new Error(`Model ${id}: not found at ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    const cache = await caches.open(MODEL_CACHE);
    await cache.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
  } catch {
    // Best effort.
  }
  return bytes.buffer;
}
