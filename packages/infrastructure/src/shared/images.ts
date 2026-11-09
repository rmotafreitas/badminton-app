import { createHash } from "node:crypto";
import type { ImageProcessor, ProcessedImage } from "@bb/application";
import { BusinessRuleViolation } from "@bb/domain";

/** Resizes and re-encodes every upload as WebP (strips metadata, bounds the size), and versions it by content. */
export const sharpImageProcessor: ImageProcessor = {
  async toWebp(bytes, { maxWidth, maxHeight, quality }): Promise<ProcessedImage> {
    // Loaded on the first upload, not at cold start: most requests never touch an image.
    const { default: sharp } = await import("sharp");
    let output: Buffer;
    try {
      output = await sharp(bytes)
        .rotate()
        .resize({ width: maxWidth, height: maxHeight, fit: sharp.fit.inside, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
    } catch {
      throw new BusinessRuleViolation("That file isn't an image we can read.", "invalid_image");
    }
    return {
      dataUrl: `data:image/webp;base64,${output.toString("base64")}`,
      version: imageVersion(output),
    };
  },
};

export const imageVersion = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex").slice(0, 16);
