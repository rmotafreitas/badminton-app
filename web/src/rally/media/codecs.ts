/**
 * Encoder capabilities differ per platform (e.g. desktop Linux Chrome has no
 * AAC encoder). Pick the most shareable codecs that this device can encode.
 */
import { canEncodeAudio, canEncodeVideo, type AudioCodec, type VideoCodec } from "mediabunny";

export interface CodecChoice {
  video: VideoCodec;
  /** null → export without audio rather than fail. */
  audio: AudioCodec | null;
}

let cached: Promise<CodecChoice> | null = null;

export function pickCodecs(width = 1280, height = 720): Promise<CodecChoice> {
  if (!cached) {
    cached = (async () => {
      let video: VideoCodec = "avc";
      for (const c of ["avc", "hevc", "vp9"] as const) {
        if (await canEncodeVideo(c, { width, height, bitrate: 3e6 })) {
          video = c;
          break;
        }
      }
      let audio: AudioCodec | null = null;
      for (const c of ["aac", "opus"] as const) {
        if (await canEncodeAudio(c, { numberOfChannels: 2, sampleRate: 48000, bitrate: 128e3 })) {
          audio = c;
          break;
        }
      }
      return { video, audio };
    })();
  }
  return cached;
}
