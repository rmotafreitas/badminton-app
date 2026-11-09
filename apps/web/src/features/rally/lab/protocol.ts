import type { ComputeBackend } from "@/features/rally/engine/runtime/types";
import type { ModelId } from "@/features/rally/engine/models/registry";
import type { Box } from "@/features/rally/engine/models/yolox";

export interface MicroCase {
  model: ModelId;
  runtime: string;
  backend: ComputeBackend;
}

export interface MicroResult extends MicroCase {
  ok: boolean;
  error?: string;
  loadMs?: number;
  firstRunMs?: number;
  medianMs?: number;
  p90Ms?: number;
  minMs?: number;
  runs?: number;
}

export interface WorkerEnv {
  webgpuInWorker: boolean;
  adapter?: { vendor: string; architecture: string; description: string; device: string };
  shaderF16?: boolean;
  maxBufferSizeMB?: number;
  crossOriginIsolated: boolean;
  hardwareConcurrency: number;
  offscreenCanvas: boolean;
  videoDecoder: boolean;
}

export interface PipelineConfig {
  runtime: string;
  backend: ComputeBackend;
  shuttleModel: ModelId;
  seconds: number;
  /** Run the person detector on every Nth frame (0 = never). */
  personStride: number;
}

export interface PipelineResult extends PipelineConfig {
  ok: boolean;
  error?: string;
  video?: { width: number; height: number; fps: number; durationS: number; codec: string | null };
  frames?: number;
  wallS?: number;
  /** Frames fully analysed per second of wall time. */
  throughputFps?: number;
  /** Ratio of processing time to clip time (1.0 = real time). */
  realtimeFactor?: number;
  decodeMsPerFrame?: number;
  shuttleMsPerInference?: number;
  personMsPerFrame?: number;
  shuttleVisibleRatio?: number;
  /** Throughput per 5s window — reveals thermal throttling. */
  timeline?: number[];
}

export type WorkerRequest =
  | { type: "env" }
  | { type: "micro"; cases: MicroCase[]; maxRuns: number }
  | { type: "pipeline"; file: Blob; config: PipelineConfig }
  | { type: "live-init"; runtime: string; backend: ComputeBackend }
  | { type: "live-frame"; bitmap: ImageBitmap }
  | { type: "cancel" };

export type WorkerResponse =
  | { type: "env"; env: WorkerEnv }
  | { type: "log"; message: string }
  | { type: "micro-result"; result: MicroResult }
  | { type: "micro-done" }
  | { type: "pipeline-progress"; done: number; total: number; preview?: ImageBitmap }
  | { type: "pipeline-result"; result: PipelineResult }
  | { type: "live-ready"; ok: boolean; error?: string }
  | { type: "live-result"; boxes: Box[]; ms: number; width: number; height: number };
