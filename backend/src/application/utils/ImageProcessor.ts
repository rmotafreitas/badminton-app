import sharp from "sharp";

export class ImageProcessor {
  /**
   * Compresses an image, converts it to WebP format, and returns a Base64 string.
   */
  static async processToWebPBase64(
    file: File | undefined | null,
    options: { maxWidth?: number; maxHeight?: number; quality?: number } = {},
  ): Promise<string | undefined> {
    if (!file) return undefined;

    const { maxWidth = 1200, maxHeight = 1200, quality = 50 } = options;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const processedBuffer = await sharp(buffer)
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: sharp.fit.inside,
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();

    return `data:image/webp;base64,${processedBuffer.toString("base64")}`;
  }
}
