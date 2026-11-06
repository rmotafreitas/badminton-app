/// <reference lib="webworker" />
/**
 * Feasibility benchmark worker (milestone 2 spike).
 * Measures, on the actual device: model load/latency per runtime+backend,
 * an end-to-end decode → person detection → shuttle tracking pipeline on a
 * real video, and live-camera person detection throughput.
 */
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { runtimes } from "../engine/runtime/ort-runtime";
import type { InferenceRuntime, InferenceSession, Tensor } from "../engine/runtime/types";
import { tensor } from "../engine/runtime/types";
import { MODELS, fetchModel, type ModelId } from "../engine/models/registry";
import { detectPeople, type Box } from "../engine/models/yolox";
import {
  TN_H,
  TN_SEQ,
  TN_W,
  detectShuttle,
  medianBackground,
  type RgbaFrame,
  type ShuttlePoint,
} from "../engine/models/tracknet";
import type {
  MicroCase,
  MicroResult,
  PipelineConfig,
  PipelineResult,
  WorkerEnv,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

let cancelled = false;

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

function log(message: string) {
  post({ type: "log", message });
}

function getRuntime(id: string): InferenceRuntime {
  const r = runtimes.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown runtime ${id}`);
  return r;
}

async function openSession(model: ModelId, runtime: string, backend: MicroCase["backend"]) {
  const bytes = await fetchModel(model);
  const t0 = performance.now();
  const session = await getRuntime(runtime).createSession(bytes, { backend });
  return { session, loadMs: performance.now() - t0 };
}

// ── Environment ──────────────────────────────────────────────────────────────

async function env(): Promise<WorkerEnv> {
  const result: WorkerEnv = {
    webgpuInWorker: false,
    crossOriginIsolated: self.crossOriginIsolated,
    hardwareConcurrency: navigator.hardwareConcurrency,
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    videoDecoder: typeof VideoDecoder !== "undefined",
  };
  const gpu = navigator.gpu;
  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter();
      if (adapter) {
        result.webgpuInWorker = true;
        const info = adapter.info;
        result.adapter = {
          vendor: info.vendor,
          architecture: info.architecture,
          description: info.description,
          device: info.device,
        };
        result.shaderF16 = adapter.features.has("shader-f16");
        result.maxBufferSizeMB = Math.round(adapter.limits.maxBufferSize / 1024 / 1024);
      }
    } catch {
      // leave webgpuInWorker false
    }
  }
  return result;
}

// ── Micro benchmarks ────────────────────────────────────────────────────────

function syntheticInputs(model: ModelId): Record<string, Tensor> {
  const feeds: Record<string, Tensor> = {};
  for (const [name, dims] of Object.entries(MODELS[model].inputs)) {
    const size = dims.reduce((a, b) => a * b, 1);
    const data = new Float32Array(size);
    for (let i = 0; i < size; i++) data[i] = Math.random();
    feeds[name] = tensor("float32", data, dims);
  }
  return feeds;
}

function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
  return { medianMs: at(0.5), p90Ms: at(0.9), minMs: s[0]! };
}

async function micro(cases: MicroCase[], maxRuns: number) {
  for (const c of cases) {
    if (cancelled) break;
    const result: MicroResult = { ...c, ok: false };
    let session: InferenceSession | undefined;
    try {
      if (!(await getRuntime(c.runtime).supports(c.backend))) {
        throw new Error(`${c.backend} not available`);
      }
      log(`${c.model} · ${c.runtime} · ${c.backend}: loading`);
      const opened = await openSession(c.model, c.runtime, c.backend);
      session = opened.session;
      result.loadMs = opened.loadMs;
      const feeds = syntheticInputs(c.model);
      let t = performance.now();
      await session.run(feeds);
      result.firstRunMs = performance.now() - t;
      // Heavy cases get fewer runs; cap each case at ~10s.
      const budgetMs = 10_000;
      const samples: number[] = [];
      const started = performance.now();
      while (samples.length < maxRuns && performance.now() - started < budgetMs && !cancelled) {
        t = performance.now();
        await session.run(feeds);
        samples.push(performance.now() - t);
      }
      Object.assign(result, stats(samples), { runs: samples.length, ok: true });
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e);
    } finally {
      await session?.release().catch(() => undefined);
    }
    post({ type: "micro-result", result });
  }
  post({ type: "micro-done" });
}

// ── Video pipeline ──────────────────────────────────────────────────────────

const tnCanvas = new OffscreenCanvas(TN_W, TN_H);
const tnCtx = tnCanvas.getContext("2d", { willReadFrequently: true })!;

function toTrackNetFrame(src: CanvasImageSource, crop?: { sy: number; sh: number; w: number }) {
  if (crop) tnCtx.drawImage(src, 0, crop.sy, crop.w, crop.sh, 0, 0, TN_W, TN_H);
  else tnCtx.drawImage(src, 0, 0, TN_W, TN_H);
  return tnCtx.getImageData(0, 0, TN_W, TN_H).data;
}

const previewCanvas = new OffscreenCanvas(480, 270);
const previewCtx = previewCanvas.getContext("2d")!;

function renderPreview(
  src: CanvasImageSource,
  w: number,
  h: number,
  boxes: Box[],
  trail: ShuttlePoint[],
  crop?: { sy: number; sh: number },
) {
  const pw = 480;
  const ph = Math.round((pw * h) / w);
  previewCanvas.width = pw;
  previewCanvas.height = ph;
  previewCtx.drawImage(src, 0, 0, pw, ph);
  const sx = pw / w;
  const sy = ph / h;
  previewCtx.lineWidth = 2;
  previewCtx.strokeStyle = "#a3e635";
  for (const b of boxes) {
    previewCtx.strokeRect(b.x1 * sx, b.y1 * sy, (b.x2 - b.x1) * sx, (b.y2 - b.y1) * sy);
  }
  previewCtx.fillStyle = "#f43f5e";
  for (const p of trail) {
    // TrackNet coords → source coords
    const x = (p.x / TN_W) * w;
    const y = crop ? crop.sy + (p.y / TN_H) * crop.sh : (p.y / TN_H) * h;
    previewCtx.beginPath();
    previewCtx.arc(x * sx, y * sy, 3, 0, Math.PI * 2);
    previewCtx.fill();
  }
  return previewCanvas.transferToImageBitmap();
}

async function pipeline(file: Blob, config: PipelineConfig): Promise<PipelineResult> {
  const result: PipelineResult = { ...config, ok: false };
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track");
    const [w0, h0, durationS, stats] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.computeDuration(),
      track.computePacketStats(120),
    ]);
    result.video = {
      width: w0,
      height: h0,
      fps: Math.round(stats.averagePacketRate * 10) / 10,
      durationS: Math.round(durationS * 10) / 10,
      codec: track.codec,
    };
    // Decode at ≤960px on the long side: enough for 416px person detection.
    const scale = Math.min(1, 960 / Math.max(w0, h0));
    const w = Math.round((w0 * scale) / 2) * 2;
    const h = Math.round((h0 * scale) / 2) * 2;
    // Portrait video: TrackNet expects 16:9, so analyse the 16:9 band where
    // play usually is (upper-middle). Production will choose this band from
    // the detected court instead.
    const crop = h > w ? { sy: Math.round(h * 0.25), sh: Math.round((w * 9) / 16), w } : undefined;

    const end = Math.min(durationS, config.seconds);
    const sink = new CanvasSink(track, { width: w, height: h, fit: "fill", poolSize: 3 });

    log("Computing background median…");
    const sampleTimes = Array.from({ length: 15 }, (_, i) => (end * (i + 0.5)) / 15);
    const samples: RgbaFrame[] = [];
    for await (const c of sink.canvasesAtTimestamps(sampleTimes)) {
      if (c) samples.push(new Uint8ClampedArray(toTrackNetFrame(c.canvas, crop)));
    }
    const median = medianBackground(samples);

    log("Loading models…");
    const tn = (await openSession(config.shuttleModel, config.runtime, config.backend)).session;
    const person =
      config.personStride > 0
        ? (await openSession("yolox-tiny-person", config.runtime, config.backend)).session
        : undefined;
    // Warm up both (shader compilation) so it doesn't pollute timings.
    await detectShuttle(tn, median, Array(TN_SEQ).fill(median));
    if (person) await detectPeople(person, previewCanvas, previewCanvas.width, previewCanvas.height);

    const totalFrames = Math.max(1, Math.round(end * (result.video.fps || 30)));
    let frames = 0;
    let decodeMs = 0;
    let tnMs = 0;
    let tnRuns = 0;
    let personMs = 0;
    let personRuns = 0;
    let visible = 0;
    let lastBoxes: Box[] = [];
    const trail: ShuttlePoint[] = [];
    const seq: RgbaFrame[] = [];
    const timeline: number[] = [];
    let windowStart = performance.now();
    let windowFrames = 0;
    const t0 = performance.now();
    let tDecode = performance.now();
    let lastPreview = 0;

    for await (const wrapped of sink.canvases(0, end)) {
      if (cancelled) break;
      decodeMs += performance.now() - tDecode;
      frames++;
      windowFrames++;
      seq.push(new Uint8ClampedArray(toTrackNetFrame(wrapped.canvas, crop)));

      if (person && frames % config.personStride === 0) {
        const t = performance.now();
        lastBoxes = await detectPeople(person, wrapped.canvas, w, h);
        personMs += performance.now() - t;
        personRuns++;
      }

      if (seq.length === TN_SEQ) {
        const t = performance.now();
        const pts = await detectShuttle(tn, median, seq);
        tnMs += performance.now() - t;
        tnRuns++;
        for (const p of pts) {
          if (!p) continue;
          visible++;
          trail.push(p);
          if (trail.length > 24) trail.shift();
        }
        seq.length = 0;
      }

      const now = performance.now();
      if (now - windowStart >= 5000) {
        timeline.push(Math.round((windowFrames / ((now - windowStart) / 1000)) * 10) / 10);
        windowStart = now;
        windowFrames = 0;
      }
      if (now - lastPreview > 1000) {
        lastPreview = now;
        const preview = renderPreview(wrapped.canvas, w, h, lastBoxes, trail, crop);
        post({ type: "pipeline-progress", done: frames, total: totalFrames, preview }, [preview]);
      }
      tDecode = performance.now();
    }

    const wallS = (performance.now() - t0) / 1000;
    Object.assign(result, {
      ok: true,
      frames,
      wallS: Math.round(wallS * 10) / 10,
      throughputFps: Math.round((frames / wallS) * 10) / 10,
      realtimeFactor: Math.round((wallS / Math.max(0.001, frames / (result.video.fps || 30))) * 100) / 100,
      decodeMsPerFrame: Math.round((decodeMs / Math.max(1, frames)) * 10) / 10,
      shuttleMsPerInference: tnRuns ? Math.round(tnMs / tnRuns) : undefined,
      personMsPerFrame: personRuns ? Math.round(personMs / personRuns) : undefined,
      shuttleVisibleRatio: Math.round((visible / Math.max(1, tnRuns * TN_SEQ)) * 100) / 100,
      timeline,
    });
    await tn.release();
    await person?.release();
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  } finally {
    input.dispose();
  }
  return result;
}

// ── Live camera ─────────────────────────────────────────────────────────────

let liveSession: InferenceSession | null = null;

async function liveInit(runtime: string, backend: MicroCase["backend"]) {
  try {
    await liveSession?.release();
    liveSession = (await openSession("yolox-tiny-person", runtime, backend)).session;
    post({ type: "live-ready", ok: true });
  } catch (e) {
    post({ type: "live-ready", ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

async function liveFrame(bitmap: ImageBitmap) {
  if (!liveSession) {
    bitmap.close();
    return;
  }
  const t = performance.now();
  const boxes = await detectPeople(liveSession, bitmap, bitmap.width, bitmap.height);
  const ms = performance.now() - t;
  post({ type: "live-result", boxes, ms, width: bitmap.width, height: bitmap.height });
  bitmap.close();
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  switch (msg.type) {
    case "env":
      post({ type: "env", env: await env() });
      break;
    case "micro":
      cancelled = false;
      await micro(msg.cases, msg.maxRuns);
      break;
    case "pipeline":
      cancelled = false;
      post({ type: "pipeline-result", result: await pipeline(msg.file, msg.config) });
      break;
    case "live-init":
      await liveInit(msg.runtime, msg.backend);
      break;
    case "live-frame":
      await liveFrame(msg.bitmap);
      break;
    case "cancel":
      cancelled = true;
      break;
  }
};
