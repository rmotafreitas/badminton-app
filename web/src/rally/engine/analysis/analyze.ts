/**
 * Full on-device analysis of one video → AnalysisResult.
 *
 * Runs in a worker. Phases:
 *   prepare  probe, background median, court calibration (auto or given)
 *   scan     decode at ≤ 30 fps; players ~10×/s (YOLOX); shuttle every frame
 *            (TrackNetV3 on a 16:9 window that covers the court + the air
 *            above it, which also handles portrait video); checkpoints
 *   finish   tracking, hits, physics fits, shot types, stats
 */
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { cameraFromHomography, project, type Camera } from "../geometry/camera";
import { COURT, COURT_CORNERS } from "../geometry/court";
import { detectCourt, toGray } from "../geometry/court-detect";
import { estimateHomography } from "../geometry/homography";
import { applyH, mat3Inv, type Mat3, type Vec2, type Vec3 } from "../geometry/linalg";
import { fetchModel, type ModelId } from "../models/registry";
import { TN_H, TN_SEQ, TN_W, detectShuttle, medianBackground, type RgbaFrame } from "../models/tracknet";
import { detectPeople, mergeBoxes, type Region } from "../models/yolox";
import type { ComputeBackend, InferenceRuntime, InferenceSession } from "../runtime/types";
import { buildShots } from "../events/shots";
import { cleanShuttleTrack } from "../events/shuttle-track";
import { computeStats } from "../stats";
import { trackPlayers, type FrameDetections } from "../tracking/player-tracker";
import {
  ANALYSIS_VERSION,
  type AnalysisResult,
  type Calibration,
  type SessionFormat,
  type ShuttleSample,
} from "../types";

export type AnalysisPhase = "prepare" | "scan" | "finish";

export interface AnalysisProgress {
  phase: AnalysisPhase;
  /** 0–1 overall. */
  progress: number;
  /** Seconds of video processed / total. */
  videoS?: number;
  totalS?: number;
  /** Small preview frame with detections drawn (scan phase, ≤ 1/s). */
  preview?: ImageBitmap;
}

export interface Checkpoint {
  version: 1;
  tDone: number;
  frames: FrameDetections[];
  shuttle: ShuttleSample[];
  calibration: Calibration | null;
}

export interface AnalyzeOptions {
  runtime: InferenceRuntime;
  backend: ComputeBackend;
  /** Analysed frame rate cap (default 30). */
  maxFps?: number;
  /** Person detections per second (default 10). */
  personHz?: number;
  shuttleModel?: ModelId;
  /** Manual court corners (image px, near-left, near-right, far-right, far-left). */
  corners?: Calibration["corners"];
  format?: SessionFormat;
  onProgress?: (p: AnalysisProgress) => void;
  checkpoint?: {
    load(): Promise<Checkpoint | undefined>;
    save(c: Checkpoint): Promise<void>;
  };
  signal?: AbortSignal;
  /** Emit a preview frame at most this often (ms). 0 = never. */
  previewEveryMs?: number;
  /** Attach raw detections to the result (engine development only). */
  debug?: boolean;
}

export class AnalysisAborted extends Error {
  constructor() {
    super("Analysis cancelled");
  }
}

/** Calibration from 4 corners in source pixels. */
export function calibrationFromCorners(
  corners: Calibration["corners"],
  width: number,
  height: number,
  source: Calibration["source"],
  score = 1,
): Calibration | null {
  const H = estimateHomography(COURT_CORNERS, corners);
  if (!H) return null;
  const cam = cameraFromHomography(H, width, height);
  if (!cam) return null;
  return { corners, H, focal: cam.f, cameraCentre: cam.centre, score, source };
}

/**
 * Source-pixel rectangle fed to TrackNet: covers the court and the air above
 * it (shuttles reach ~8 m), widened to 16:9. May extend past the frame; the
 * outside is padded black.
 */
export function trackNetWindow(cam: Camera | null, w: number, h: number) {
  if (!cam) return fitAspect({ x0: 0, y0: 0, x1: w, y1: h }, w, h);
  const pts: Vec3[] = [];
  for (const c of COURT_CORNERS) pts.push([c.x, c.y, 0], [c.x, c.y, 6]);
  pts.push([0, 0, 8], [-COURT.halfDoublesWidth, 0, 6], [COURT.halfDoublesWidth, 0, 6]);
  const img = pts.map((p) => project(cam, p)).filter((p): p is Vec2 => !!p);
  if (img.length < 4) return fitAspect({ x0: 0, y0: 0, x1: w, y1: h }, w, h);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const r = {
    x0: clamp(Math.min(...img.map((p) => p.x)), 0, w),
    y0: clamp(Math.min(...img.map((p) => p.y)), 0, h),
    x1: clamp(Math.max(...img.map((p) => p.x)), 0, w),
    y1: clamp(Math.max(...img.map((p) => p.y)), 0, h),
  };
  return fitAspect(r, w, h);
}

function fitAspect(r: { x0: number; y0: number; x1: number; y1: number }, w: number, h: number) {
  let sw = Math.max(16, r.x1 - r.x0);
  let sh = Math.max(9, r.y1 - r.y0);
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  if (sw / sh < 16 / 9) sw = (sh * 16) / 9;
  else sh = (sw * 9) / 16;
  // Prefer staying inside the frame when possible.
  let sx = Math.min(Math.max(0, cx - sw / 2), Math.max(0, w - sw));
  let sy = Math.min(Math.max(0, cy - sh / 2), Math.max(0, h - sh));
  if (sw > w) sx = cx - sw / 2;
  if (sh > h) sy = cy - sh / 2;
  return { sx, sy, sw, sh };
}

const now = () => performance.now();

export async function analyzeVideo(file: Blob, opts: AnalyzeOptions): Promise<AnalysisResult> {
  const abort = () => {
    if (opts.signal?.aborted) throw new AnalysisAborted();
  };
  const report = (p: AnalysisProgress, transfer?: ImageBitmap) => {
    opts.onProgress?.(p);
    if (transfer && !opts.onProgress) transfer.close();
  };
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const sessions: InferenceSession[] = [];
  try {
    // ── prepare ────────────────────────────────────────────────────────────
    report({ phase: "prepare", progress: 0 });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("This file has no video track");
    const [srcW, srcH, durationS, stats] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.computeDuration(),
      track.computePacketStats(120),
    ]);
    const fps = stats.averagePacketRate || 30;
    const analysedFps = Math.min(fps, opts.maxFps ?? 30);
    const scale = Math.min(1, 960 / Math.max(srcW, srcH));
    const dw = Math.round((srcW * scale) / 2) * 2;
    const dh = Math.round((srcH * scale) / 2) * 2;
    const k = srcW / dw; // decode px → source px
    const sink = new CanvasSink(track, { width: dw, height: dh, fit: "fill", poolSize: 3 });

    // Background median (players removed): court detection + TrackNet input.
    const sampleTimes = Array.from({ length: 25 }, (_, i) => (durationS * (i + 0.5)) / 25);
    const bgCanvas = new OffscreenCanvas(dw, dh);
    const bgCtx = bgCanvas.getContext("2d", { willReadFrequently: true })!;
    const bgFrames: Uint8ClampedArray<ArrayBuffer>[] = [];
    for await (const c of sink.canvasesAtTimestamps(sampleTimes)) {
      abort();
      if (!c) continue;
      bgCtx.drawImage(c.canvas, 0, 0);
      bgFrames.push(new Uint8ClampedArray(bgCtx.getImageData(0, 0, dw, dh).data));
    }
    if (!bgFrames.length) throw new Error("Could not decode the video");
    const bg = medianRgba(bgFrames, dw * dh);
    report({ phase: "prepare", progress: 0.02 });

    const shuttleModel = opts.shuttleModel ?? "tracknetv3-fp16";
    const [tnBytes, personBytes] = await Promise.all([
      fetchModel(shuttleModel),
      fetchModel("yolox-tiny-person"),
    ]);
    const person = await opts.runtime.createSession(personBytes, { backend: opts.backend });
    sessions.push(person);

    let calibration: Calibration | null = null;
    const ckpt = await opts.checkpoint?.load();
    if (opts.corners) {
      calibration = calibrationFromCorners(opts.corners, srcW, srcH, "manual");
    } else if (ckpt?.calibration) {
      calibration = ckpt.calibration;
    } else {
      // Where people stand is strong evidence for which lines are the court.
      const feet: Vec2[] = [];
      for (const f of bgFrames.filter((_, i) => i % 2 === 0)) {
        abort();
        bgCtx.putImageData(new ImageData(f, dw, dh), 0, 0);
        for (const b of await detectPeople(person, bgCanvas, dw, dh)) feet.push({ x: (b.x1 + b.x2) / 2, y: b.y2 });
      }
      calibration = autoCalibrate(bg, dw, dh, srcW, srcH, feet);
    }
    const cam = calibration ? cameraFromHomography(calibration.H, srcW, srcH) : null;

    // Far players are small: also detect on a zoomed crop of the far half.
    const farRegion = cam ? farHalfRegion(cam, srcW, srcH, k) : null;

    // TrackNet window in source px → decode px.
    const win = trackNetWindow(cam, srcW, srcH);
    const tnCanvas = new OffscreenCanvas(TN_W, TN_H);
    const tnCtx = tnCanvas.getContext("2d", { willReadFrequently: true })!;
    const toTn = (src: CanvasImageSource): RgbaFrame => {
      tnCtx.fillStyle = "#000";
      tnCtx.fillRect(0, 0, TN_W, TN_H);
      tnCtx.drawImage(src, win.sx / k, win.sy / k, win.sw / k, win.sh / k, 0, 0, TN_W, TN_H);
      return new Uint8ClampedArray(tnCtx.getImageData(0, 0, TN_W, TN_H).data);
    };
    const tnBg = medianBackground(
      bgFrames.map((f) => {
        bgCtx.putImageData(new ImageData(f, dw, dh), 0, 0);
        return toTn(bgCanvas);
      }),
    );
    bgFrames.length = 0;

    const tn = await opts.runtime.createSession(tnBytes, { backend: opts.backend });
    sessions.push(tn);
    report({ phase: "prepare", progress: 0.05 });

    // ── scan ───────────────────────────────────────────────────────────────
    const frames: FrameDetections[] = ckpt?.frames ?? [];
    const shuttle: ShuttleSample[] = ckpt?.shuttle ?? [];
    const tStart = ckpt?.tDone ?? 0;
    const step = 1 / analysedFps;
    const times: number[] = [];
    for (let t = tStart > 0 ? tStart + step : 0; t < durationS; t += step) times.push(t);
    const personEvery = Math.max(1, Math.round(analysedFps / (opts.personHz ?? 10)));

    const seq: RgbaFrame[] = [];
    const seqT: number[] = [];
    let n = 0;
    let lastSave = now();
    let lastPreview = 0;
    const previewMs = opts.previewEveryMs ?? 1000;

    for await (const c of sink.canvasesAtTimestamps(times)) {
      abort();
      if (!c) continue;
      const t = c.timestamp;
      if (n % personEvery === 0) {
        let boxes = await detectPeople(person, c.canvas, dw, dh);
        if (farRegion) {
          boxes = mergeBoxes([boxes, await detectPeople(person, c.canvas, dw, dh, 0.35, farRegion)]);
        }
        frames.push({
          t,
          boxes: boxes.map((b) => ({ x1: b.x1 * k, y1: b.y1 * k, x2: b.x2 * k, y2: b.y2 * k, score: b.score })),
        });
      }
      seq.push(toTn(c.canvas));
      seqT.push(t);
      if (seq.length === TN_SEQ) {
        const pts = await detectShuttle(tn, tnBg, seq);
        pts.forEach((p, i) => {
          if (!p) return;
          shuttle.push({
            t: seqT[i]!,
            x: win.sx + (p.x / TN_W) * win.sw,
            y: win.sy + (p.y / TN_H) * win.sh,
            conf: Math.round(p.conf * 100) / 100,
          });
        });
        seq.length = 0;
        seqT.length = 0;
      }
      n++;

      const tNow = now();
      if (previewMs > 0 && tNow - lastPreview > previewMs) {
        lastPreview = tNow;
        const lastBoxes = frames[frames.length - 1]?.boxes ?? [];
        const recent = shuttle.filter((s) => s.t > t - 0.6);
        const preview = renderPreview(c.canvas, dw, dh, k, lastBoxes, recent, calibration);
        report(
          { phase: "scan", progress: 0.05 + 0.9 * (t / durationS), videoS: t, totalS: durationS, preview },
          preview,
        );
      }
      // Checkpoint every ~20 s of wall time, on a TrackNet window boundary.
      if (opts.checkpoint && seq.length === 0 && tNow - lastSave > 20_000) {
        lastSave = tNow;
        await opts.checkpoint.save({ version: 1, tDone: t, frames, shuttle, calibration });
      }
    }

    // ── finish ─────────────────────────────────────────────────────────────
    report({ phase: "finish", progress: 0.96 });
    const Hinv = calibration ? mat3Inv(calibration.H) : null;
    const toCourt = (p: Vec2) => (Hinv ? applyH(Hinv, p) : null);
    const tracked = trackPlayers(frames, {
      toCourt,
      format: opts.format,
      heightOf: cam ? (box, court) => personHeight(cam, box, court, srcH) : undefined,
    });
    const cleaned = cleanShuttleTrack(shuttle, { fps: analysedFps, diagonal: Math.hypot(srcW, srcH) });
    const sides = Object.fromEntries(tracked.players.map((p) => [p.id, p.side]));
    const { rallies, shots } = buildShots({
      track: cleaned,
      tracks: tracked.tracks,
      sides,
      camera: cam,
      fps: analysedFps,
    });
    const partial = { players: tracked.players, tracks: tracked.tracks, shots, rallies };
    const result: AnalysisResult = {
      version: ANALYSIS_VERSION,
      createdAt: new Date().toISOString(),
      engine: { runtime: opts.runtime.id, backend: tn.backend, models: [shuttleModel, "yolox-tiny-person"] },
      video: {
        width: srcW,
        height: srcH,
        fps: Math.round(fps * 100) / 100,
        durationS: Math.round(durationS * 100) / 100,
        analysedFps: Math.round(analysedFps * 100) / 100,
      },
      format: tracked.format,
      calibration,
      players: tracked.players,
      tracks: tracked.tracks,
      shuttle: cleaned,
      rallies,
      shots,
      stats: computeStats(partial),
      ...(opts.debug ? { debug: { frames, shuttleRaw: shuttle } } : {}),
    };
    report({ phase: "finish", progress: 1 });
    return result;
  } finally {
    for (const s of sessions) await s.release().catch(() => undefined);
    input.dispose();
  }
}

/**
 * Decode-px region around the far half (players up to ~2.3 m tall), if it is
 * small enough in the frame that zooming in helps detection.
 */
function farHalfRegion(cam: Camera, srcW: number, srcH: number, k: number): Region | null {
  const pts: Vec2[] = [];
  for (const x of [-COURT.halfDoublesWidth - 0.8, COURT.halfDoublesWidth + 0.8])
    for (const y of [0, COURT.halfLength + 1])
      for (const z of [0, 2.3]) {
        const p = project(cam, [x, y, z]);
        if (p) pts.push(p);
      }
  if (pts.length < 8) return null;
  const x0 = Math.max(0, Math.min(...pts.map((p) => p.x)));
  const x1 = Math.min(srcW, Math.max(...pts.map((p) => p.x)));
  const y0 = Math.max(0, Math.min(...pts.map((p) => p.y)));
  const y1 = Math.min(srcH, Math.max(...pts.map((p) => p.y)));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0 || w * h > 0.45 * srcW * srcH) return null;
  // Pad 10 % so people at the edges aren't cut.
  const px = w * 0.1;
  const py = h * 0.1;
  return {
    x: Math.max(0, x0 - px) / k,
    y: Math.max(0, y0 - py) / k,
    w: Math.min(srcW, w + 2 * px) / k,
    h: Math.min(srcH, h + 2 * py) / k,
  };
}

/**
 * Real height (m) of a detected person: box pixel height vs the projected
 * pixel height of a 1 m pole standing on their feet. Null if the box touches
 * the frame's top/bottom edge (person cut off).
 */
export function personHeight(
  cam: Camera,
  box: { y1: number; y2: number },
  court: Vec2,
  srcH: number,
): number | null {
  if (box.y1 <= 2 || box.y2 >= srcH - 2) return null;
  const foot = project(cam, [court.x, court.y, 0]);
  const top = project(cam, [court.x, court.y, 1]);
  if (!foot || !top) return null;
  const perMetre = foot.y - top.y;
  if (perMetre <= 1) return null;
  return (box.y2 - box.y1) / perMetre;
}

function medianRgba(frames: Uint8ClampedArray[], pixels: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(pixels * 4);
  const n = frames.length;
  const buf = new Uint8Array(n);
  for (let i = 0; i < pixels * 4; i++) {
    if ((i & 3) === 3) {
      out[i] = 255;
      continue;
    }
    for (let j = 0; j < n; j++) buf[j] = frames[j]![i]!;
    buf.sort();
    out[i] = buf[n >> 1]!;
  }
  return out;
}

/** Court detection on the median background, downscaled to ≤ 640 px. */
export function autoCalibrate(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  srcW: number,
  srcH: number,
  /** People's feet in the same (decode) pixel space as `rgba`. */
  feet: Vec2[] = [],
): Calibration | null {
  const s = Math.min(1, 640 / Math.max(w, h));
  const gw = Math.round(w * s);
  const gh = Math.round(h * s);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  const small = new OffscreenCanvas(gw, gh);
  const ctx = small.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, gw, gh);
  const gray = toGray(ctx.getImageData(0, 0, gw, gh).data, gw, gh);
  const det = detectCourt(gray, { feet: feet.map((p) => ({ x: p.x * s, y: p.y * s })) });
  if (!det) return null;
  const toSrc = srcW / gw;
  const corners = det.corners.map((c) => ({ x: c.x * toSrc, y: c.y * toSrc })) as Calibration["corners"];
  return calibrationFromCorners(corners, srcW, srcH, "auto", Math.round(det.score * 100) / 100);
}

function renderPreview(
  src: CanvasImageSource,
  dw: number,
  dh: number,
  k: number,
  boxes: { x1: number; y1: number; x2: number; y2: number }[],
  shuttle: ShuttleSample[],
  cal: Calibration | null,
): ImageBitmap {
  const pw = 360;
  const ph = Math.round((pw * dh) / dw);
  const c = new OffscreenCanvas(pw, ph);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0, pw, ph);
  const s = pw / (dw * k);
  if (cal) {
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    cal.corners.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)));
    ctx.closePath();
    ctx.stroke();
  }
  ctx.strokeStyle = "#a3e635";
  ctx.lineWidth = 2;
  for (const b of boxes) ctx.strokeRect(b.x1 * s, b.y1 * s, (b.x2 - b.x1) * s, (b.y2 - b.y1) * s);
  ctx.fillStyle = "#f43f5e";
  for (const p of shuttle) {
    ctx.beginPath();
    ctx.arc(p.x * s, p.y * s, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return c.transferToImageBitmap();
}

export type { Mat3 };
