/**
 * Export a shareable MP4 with the overlay burned in, entirely on device:
 * decode → draw frame + overlay (same renderer as playback) → hardware
 * encode, audio copied through. Nothing is stored server-side.
 */
import { pickCodecs } from "./codecs";
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from "mediabunny";
import type { AnalysisResult, PlayerId } from "../engine/types";
import { DEFAULT_SKIN, renderOverlay, type OverlaySkin } from "../overlay/renderer";
import { frameState, prepareOverlay } from "../overlay/state";
import { buddyTheme, LABELS_EN, type OverlayLabels, type OverlayTheme } from "../overlay/theme";

export interface ExportOptions {
  result: AnalysisResult;
  names?: Partial<Record<PlayerId, string>>;
  theme?: OverlayTheme;
  labels?: OverlayLabels;
  skin?: OverlaySkin;
  /** Optional trim (s), e.g. one rally. */
  start?: number;
  end?: number;
  /** Longest side of the export (default 1280; 1920 for full HD). */
  maxLongSide?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export async function exportWithOverlay(video: Blob, opts: ExportOptions): Promise<Blob> {
  const { result } = opts;
  const prepared = prepareOverlay(result, opts.names);
  const maxSide = opts.maxLongSide ?? 1280;
  const s = Math.min(1, maxSide / Math.max(result.video.width, result.video.height));
  const w = Math.round((result.video.width * s) / 2) * 2;
  const h = Math.round((result.video.height * s) / 2) * 2;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  const vp = { width: w, height: h, video: { x: 0, y: 0, w, h } };

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(video) });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  try {
    const codecs = await pickCodecs();
    const conversion = await Conversion.init({
      input,
      output,
      trim: opts.start !== undefined || opts.end !== undefined ? { start: opts.start, end: opts.end } : undefined,
      video: {
        codec: codecs.video,
        bitrate: Math.round(w * h * 30 * 0.12), // ~3.3 Mbit/s at 720p30
        width: w,
        height: h,
        fit: "fill",
        hardwareAcceleration: "no-preference",
        forceTranscode: true,
        processedWidth: w,
        processedHeight: h,
        process: (sample) => {
          sample.draw(ctx, 0, 0, w, h);
          const t = sample.timestamp;
          renderOverlay(
            ctx,
            prepared,
            frameState(prepared, t),
            vp,
            opts.theme ?? buddyTheme,
            opts.labels ?? LABELS_EN,
            opts.skin ?? DEFAULT_SKIN,
            false,
          );
          return canvas;
        },
      },
      audio: codecs.audio ? { codec: codecs.audio, bitrate: 128_000 } : { discard: true },
    });
    if (!conversion.isValid) throw new Error("Export isn't supported on this device");
    conversion.onProgress = (p) => opts.onProgress?.(p);
    const onAbort = () => void conversion.cancel();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      await conversion.execute();
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
    }
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
