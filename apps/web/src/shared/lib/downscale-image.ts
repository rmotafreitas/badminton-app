/**
 * Shrinks a photo in the browser before upload: phone pictures are often 5–15 MB, more than a serverless request may
 * carry (Vercel: 4.5 MB). The server re-encodes and resizes anyway, so this only has to make the upload small.
 * GIF/SVG and already-small files are sent as they are.
 */
export async function downscaleImage(file: File, maxSide = 2048, quality = 0.88, targetBytes = 3_500_000): Promise<File> {
  if (file.size <= 1_000_000 || !/^image\/(jpeg|png|webp|heic|heif|avif)$/.test(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // the browser can't decode it (e.g. HEIC on Chrome): let the server decide
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let q = quality;
  let blob = await canvas.convertToBlob({ type: "image/jpeg", quality: q });
  while (blob.size > targetBytes && q > 0.5) {
    q -= 0.12;
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality: q });
  }
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
