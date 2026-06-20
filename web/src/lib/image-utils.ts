export async function compressImage(
  file: File,
  quality: number = 0.5,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");

        let width = img.width;
        let height = img.height;

        const MAX_DIMENSION = 1200;
        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/webp", quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Normalizes a stored image value into a valid data-URL ready for <img src>.
 * Handles: null, raw base64, single-prefix, double-prefix (legacy upload bug).
 */
export function safeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  // Already a clean data URL (single prefix + valid base64)
  if (/^data:image\/\w+;base64,[A-Za-z0-9+/=]+$/.test(value)) {
    return value;
  }

  // Double prefix (legacy): data:image/...;base64,data:image/...;base64,<data>
  // Strip everything up to and including the second "base64,"
  const match = value.match(/^data:image\/\w+;base64,(.*)$/);
  if (match) {
    const inner = match[1];
    // If inner also starts with "data:", it's double-prefixed — unwrap it
    if (inner.startsWith("data:")) {
      return safeImageUrl(inner); // recurse to handle the inner value
    }
    // Inner is raw base64 — re-wrap with single prefix
    return `data:image/webp;base64,${inner}`;
  }

  // Raw base64 without any prefix
  if (/^[A-Za-z0-9+/=]+$/.test(value)) {
    return `data:image/webp;base64,${value}`;
  }

  // Unknown format — return as-is
  return value;
}

