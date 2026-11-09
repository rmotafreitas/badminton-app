/**
 * Export a shareable MP4 with the overlay burned in, entirely on device —
 * the whole video, rallies back to back, or one shot; landscape or vertical
 * (letterboxed, or a virtual camera following the action / a player).
 * Nothing is stored server-side.
 */
import { pickCodecs } from "./codecs";
import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import type { AnalysisResult, PlayerId } from "@/features/rally/engine/types";
import { DEFAULT_SKIN, renderOverlay, type OverlaySkin, type Viewport } from "@/features/rally/overlay/renderer";
import { frameState, prepareOverlay } from "@/features/rally/overlay/state";
import { buddyTheme, LABELS_EN, type OverlayLabels, type OverlayTheme } from "@/features/rally/overlay/theme";
import {
  cameraPath,
  clipSegments,
  outputSize,
  sameAspect,
  segmentsDuration,
  type ClipFormat,
  type ClipFraming,
  type ClipScope,
  type Segment,
} from "./clips";

export interface ExportOptions {
  result: AnalysisResult;
  names?: Partial<Record<PlayerId, string>>;
  theme?: OverlayTheme;
  labels?: OverlayLabels;
  skin?: OverlaySkin;
  /** What to include (default: the whole video). */
  scope?: ClipScope;
  /** Default: the source's own orientation. */
  format?: ClipFormat;
  /** How to fill a different aspect (default: the whole court, letterboxed). */
  framing?: ClipFraming;
  /** Burn the stats overlay in (default true). */
  overlay?: boolean;
  /** Output frame rate cap (default 30: plenty for social, half the work). */
  fps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const abortError = () => new DOMException("Export cancelled", "AbortError");

type Frame = CanvasImageSource;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export interface ExportPlan {
  width: number;
  height: number;
  segments: Segment[];
  /** Clip length (s). */
  duration: number;
  /** Draws source frame `frame` (srcW×srcH, shown at time t) + overlay. */
  draw(ctx: Ctx, frame: Frame, t: number): void;
}

/**
 * Everything about an export except the media plumbing — shared by the
 * exporter and the dialog's live preview, so the preview is what you get.
 */
export function planExport(opts: ExportOptions, srcW: number, srcH: number, durationS: number): ExportPlan {
  const { result } = opts;
  const prepared = prepareOverlay(result, opts.names);
  const segments = clipSegments(result, opts.scope ?? { kind: "all" }, durationS);
  const format = opts.format ?? (srcW >= srcH ? "landscape" : "vertical");
  const same = sameAspect(format, srcW, srcH);
  const { width: W, height: H } = same
    ? (() => {
        const s = Math.min(1, 1280 / Math.max(srcW, srcH));
        return { width: Math.round((srcW * s) / 2) * 2, height: Math.round((srcH * s) / 2) * 2 };
      })()
    : outputSize(format, srcW, srcH);
  const framing = same ? null : (opts.framing ?? { kind: "court" });
  // The camera works in analysis px; the file may be a smaller review copy.
  const k = srcW / result.video.width;
  const camera =
    framing && framing.kind !== "court" && segments.length ? cameraPath(result, framing, segments, format) : null;
  const theme = opts.theme ?? buddyTheme;
  const labels = opts.labels ?? LABELS_EN;
  const skin = opts.skin ?? DEFAULT_SKIN;

  const draw = (ctx: Ctx, frame: Frame, t: number) => {
    let vp: Viewport;
    if (!framing) {
      ctx.drawImage(frame, 0, 0, W, H);
      vp = { width: W, height: H, video: { x: 0, y: 0, w: W, h: H } };
    } else if (camera) {
      const c = camera(t);
      const sx = c.x * k;
      const sy = c.y * k;
      const sw = c.w * k;
      const sh = c.h * k;
      ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, W, H);
      const z = W / sw;
      vp = { width: W, height: H, video: { x: -sx * z, y: -sy * z, w: srcW * z, h: srcH * z } };
    } else {
      // Whole court: fit inside, over a blurred, darkened fill of the frame.
      const fit = Math.min(W / srcW, H / srcH);
      const cover = Math.max(W / srcW, H / srcH);
      const v = { w: srcW * fit, h: srcH * fit, x: (W - srcW * fit) / 2, y: (H - srcH * fit) / 2 };
      // Safari < 18 has no ctx.filter: fall back to a dark wash.
      const blurOk = typeof (ctx as { filter?: unknown }).filter === "string";
      if (blurOk) ctx.filter = "blur(18px) brightness(0.45)";
      ctx.drawImage(frame, (W - srcW * cover) / 2, (H - srcH * cover) / 2, srcW * cover, srcH * cover);
      if (blurOk) ctx.filter = "none";
      else {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, W, H);
      }
      ctx.drawImage(frame, v.x, v.y, v.w, v.h);
      vp = { width: W, height: H, video: v };
    }
    if (opts.overlay !== false) renderOverlay(ctx, prepared, frameState(prepared, t), vp, theme, labels, skin, false);
  };
  return { width: W, height: H, segments, duration: segmentsDuration(segments), draw };
}

/**
 * Renders the chosen segments back to back into one MP4: decode → frame
 * (cropped by the virtual camera, or letterboxed over a blurred copy) →
 * overlay (same renderer as playback) → encode; audio follows each segment.
 */
export async function exportWithOverlay(video: Blob, opts: ExportOptions): Promise<Blob> {
  const fps = opts.fps ?? 30;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(video) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("This file has no video track");
    const [srcW, srcH, durationS] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.computeDuration(),
    ]);
    const plan = planExport(opts, srcW, srcH, durationS);
    if (!plan.segments.length) throw new Error("Nothing to export");
    const { width: W, height: H } = plan;

    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext("2d")!;
    const codecs = await pickCodecs(W, H);
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const videoOut = new CanvasSource(canvas, {
      codec: codecs.video,
      bitrate: Math.round(W * H * fps * 0.12), // ~3.3 Mbit/s at 720p30
      keyFrameInterval: 2,
      hardwareAcceleration: "no-preference",
    });
    output.addVideoTrack(videoOut, { frameRate: fps });
    const audioTrack = codecs.audio ? await input.getPrimaryAudioTrack() : null;
    const audioOut =
      audioTrack && codecs.audio && (await audioTrack.canDecode())
        ? new AudioSampleSource({ codec: codecs.audio, bitrate: 128_000 })
        : null;
    if (audioOut) output.addAudioTrack(audioOut);
    await output.start();

    const frames = new CanvasSink(track, { poolSize: 2 });
    const audio = audioOut && audioTrack ? new AudioSampleSink(audioTrack) : null;
    let offset = 0;
    try {
      for (const seg of plan.segments) {
        let next = seg.start;
        for await (const f of frames.canvases(seg.start, seg.end)) {
          if (opts.signal?.aborted) throw abortError();
          if (f.timestamp + 1e-3 < next) continue;
          while (next <= f.timestamp + 1e-3) next += 1 / fps;
          plan.draw(ctx, f.canvas, f.timestamp);
          await videoOut.add(offset + Math.max(0, f.timestamp - seg.start), 1 / fps);
          opts.onProgress?.(Math.min(0.99, (offset + f.timestamp - seg.start) / plan.duration));
        }
        if (audio && audioOut) {
          for await (const a of audio.samples(seg.start, seg.end)) {
            try {
              if (opts.signal?.aborted) throw abortError();
              if (a.timestamp + a.duration <= seg.start) continue;
              a.setTimestamp(offset + Math.max(0, a.timestamp - seg.start));
              await audioOut.add(a);
            } finally {
              a.close();
            }
          }
        }
        offset += seg.end - seg.start;
      }
      videoOut.close();
      audioOut?.close();
      await output.finalize();
    } catch (e) {
      await output.cancel().catch(() => undefined);
      throw e;
    }
    opts.onProgress?.(1);
    const buf = (output.target as BufferTarget).buffer;
    if (!buf) throw new Error("Export produced no data");
    return new Blob([buf], { type: "video/mp4" });
  } finally {
    input.dispose();
  }
}

/** True if this browser can hand a video file to the OS share sheet. */
export function canShareFile(file: Blob, name: string): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File([file], name, { type: file.type || "video/mp4" })] });
  } catch {
    return false;
  }
}

/**
 * Share via the OS sheet. Must run inside a fresh user gesture (a tap): an
 * export takes long enough that the gesture that started it has expired.
 */
export async function shareFile(file: Blob, name: string): Promise<boolean> {
  const f = new File([file], name, { type: file.type || "video/mp4" });
  try {
    await navigator.share({ files: [f], title: name });
    return true;
  } catch (e) {
    return (e as Error).name === "AbortError";
  }
}

export function downloadFile(file: Blob, name: string) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
