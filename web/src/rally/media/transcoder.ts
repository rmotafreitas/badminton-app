/**
 * Video transcoding port. The app depends on `VideoTranscoder`, never on a
 * codec library: today's adapter uses the browser's hardware encoder via
 * WebCodecs (mediabunny); an FFmpeg.wasm adapter can be dropped in later.
 */
import { pickCodecs } from "./codecs";
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from "mediabunny";

export interface TranscodeOptions {
  /** Longest output side in px (720p review copy → 1280). */
  maxLongSide: number;
  /** Frame-rate cap. Analysis likes 60; never upsample. */
  maxFps: number;
  /** Target video bitrate (bit/s). */
  bitrate: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface MediaInfo {
  width: number;
  height: number;
  fps: number;
  durationS: number;
  bitrate: number;
  codec: string | null;
}

export interface VideoTranscoder {
  readonly id: string;
  supported(): Promise<boolean>;
  probe(file: Blob): Promise<MediaInfo>;
  transcode(file: Blob, opts: TranscodeOptions): Promise<Blob>;
}

/** 720p60 review copy: plenty for the models (≤ 640 px inputs), ~15 MB/min. */
export const REVIEW_COPY: Omit<TranscodeOptions, "onProgress" | "signal"> = {
  maxLongSide: 1280,
  maxFps: 60,
  bitrate: 2_000_000,
};

/** True if the file is already small enough to upload as-is. */
export function fitsReviewCopy(info: MediaInfo, opts = REVIEW_COPY): boolean {
  return (
    Math.max(info.width, info.height) <= opts.maxLongSide &&
    info.bitrate <= opts.bitrate * 1.6 &&
    (info.codec === "avc" || info.codec === "hevc")
  );
}

export class WebCodecsTranscoder implements VideoTranscoder {
  readonly id = "webcodecs";

  async supported(): Promise<boolean> {
    return typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";
  }

  async probe(file: Blob): Promise<MediaInfo> {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error("No video track");
      const [width, height, durationS, stats] = await Promise.all([
        track.getDisplayWidth(),
        track.getDisplayHeight(),
        input.computeDuration(),
        track.computePacketStats(120),
      ]);
      return {
        width,
        height,
        durationS,
        fps: stats.averagePacketRate,
        bitrate: stats.averageBitrate,
        codec: track.codec,
      };
    } finally {
      input.dispose();
    }
  }

  async transcode(file: Blob, opts: TranscodeOptions): Promise<Blob> {
    const info = await this.probe(file);
    const scale = Math.min(1, opts.maxLongSide / Math.max(info.width, info.height));
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });
    try {
      const codecs = await pickCodecs();
    const conversion = await Conversion.init({
        input,
        output,
        video: {
          codec: codecs.video,
          bitrate: opts.bitrate,
          // Even dimensions for H.264.
          width: Math.round((info.width * scale) / 2) * 2,
          height: Math.round((info.height * scale) / 2) * 2,
          fit: "fill",
          frameRate: Math.min(info.fps || 30, opts.maxFps),
          hardwareAcceleration: "no-preference",
        },
        audio: codecs.audio ? { codec: codecs.audio, bitrate: 96_000 } : { discard: true },
      });
      if (!conversion.isValid) throw new Error("This video can't be converted on this device");
      conversion.onProgress = (p) => opts.onProgress?.(p);
      const onAbort = () => void conversion.cancel();
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        await conversion.execute();
      } finally {
        opts.signal?.removeEventListener("abort", onAbort);
      }
      const buf = (output.target as BufferTarget).buffer;
      if (!buf) throw new Error("Conversion produced no data");
      return new Blob([buf], { type: "video/mp4" });
    } finally {
      input.dispose();
    }
  }
}

export const defaultTranscoder: VideoTranscoder = new WebCodecsTranscoder();
