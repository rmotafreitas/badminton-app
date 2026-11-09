import type { ImageProcessor, ImageUpload, ProcessedImage } from "./ports";

/** Profile photos and club logos are small squares; covers are wide 3:1 banners. */
const PRESETS = {
  square: { maxWidth: 512, maxHeight: 512, quality: 70 },
  banner: { maxWidth: 1600, maxHeight: 534, quality: 60 },
} as const;

/** An upload → what to store: the re-encoded image, or null to remove it. */
export const processUpload = (images: ImageProcessor, upload: ImageUpload, preset: keyof typeof PRESETS): Promise<ProcessedImage | null> =>
  upload.kind === "remove" ? Promise.resolve(null) : images.toWebp(upload.bytes, PRESETS[preset]);
