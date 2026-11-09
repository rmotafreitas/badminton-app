/// <reference lib="webworker" />
/**
 * Background analysis worker. One job at a time; progress and the result
 * are posted back. Picks the fastest available backend: WebGPU (JSEP) →
 * WASM.
 */
import { ortJsepRuntime, hasWebGpu } from "@/features/rally/engine/runtime/ort-runtime";
import { idbDelete, idbGet, idbPut, STORES } from "@/features/rally/storage/idb";
import {
  AnalysisAborted,
  analyzeVideo,
  calibrateVideo,
  type AnalysisProgress,
  type CalibrationCheck,
  type Checkpoint,
} from "./analyze";
import type { AnalysisResult, Calibration, SessionFormat } from "@/features/rally/engine/types";

declare const self: DedicatedWorkerGlobalScope;

export type AnalysisRequest =
  | {
      type: "start";
      jobId: string;
      file: Blob;
      corners?: Calibration["corners"];
      format?: SessionFormat;
      preview?: boolean;
      debug?: boolean;
    }
  | { type: "calibrate"; jobId: string; file: Blob }
  | { type: "cancel"; jobId: string };

export type AnalysisResponse =
  | { type: "progress"; jobId: string; progress: AnalysisProgress }
  | { type: "done"; jobId: string; result: AnalysisResult }
  | { type: "calibrated"; jobId: string; check: CalibrationCheck }
  | { type: "error"; jobId: string; message: string; cancelled?: boolean };

const controllers = new Map<string, AbortController>();

const fail = (jobId: string, e: unknown) =>
  self.postMessage({
    type: "error",
    jobId,
    message: e instanceof Error ? e.message : String(e),
    cancelled: e instanceof AnalysisAborted,
  } satisfies AnalysisResponse);

self.onmessage = async (ev: MessageEvent<AnalysisRequest>) => {
  const msg = ev.data;
  if (msg.type === "cancel") {
    controllers.get(msg.jobId)?.abort();
    return;
  }
  const ctrl = new AbortController();
  controllers.set(msg.jobId, ctrl);
  if (msg.type === "calibrate") {
    try {
      const backend = (await hasWebGpu()) ? "webgpu" : "wasm";
      const check = await calibrateVideo(msg.file, { runtime: ortJsepRuntime, backend, signal: ctrl.signal });
      self.postMessage({ type: "calibrated", jobId: msg.jobId, check } satisfies AnalysisResponse);
    } catch (e) {
      fail(msg.jobId, e);
    } finally {
      controllers.delete(msg.jobId);
    }
    return;
  }
  try {
    const backend = (await hasWebGpu()) ? "webgpu" : "wasm";
    const result = await analyzeVideo(msg.file, {
      runtime: ortJsepRuntime,
      backend,
      corners: msg.corners,
      format: msg.format,
      signal: ctrl.signal,
      previewEveryMs: msg.preview ? 1000 : 0,
      debug: msg.debug,
      onProgress: (progress) => {
        const transfer = progress.preview ? [progress.preview] : [];
        self.postMessage({ type: "progress", jobId: msg.jobId, progress } satisfies AnalysisResponse, transfer);
      },
      checkpoint: {
        load: () => idbGet<Checkpoint>(STORES.checkpoints, msg.jobId),
        save: (c) => idbPut(STORES.checkpoints, msg.jobId, c),
      },
    });
    await idbDelete(STORES.checkpoints, msg.jobId).catch(() => undefined);
    self.postMessage({ type: "done", jobId: msg.jobId, result } satisfies AnalysisResponse);
  } catch (e) {
    fail(msg.jobId, e);
  } finally {
    controllers.delete(msg.jobId);
  }
};
