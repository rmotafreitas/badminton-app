/**
 * Normalizes a stored image value into a ready-to-use data URL.
 * Handles: raw base64, single-prefix, double-prefix (legacy bug).
 */
export function normalizeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  // Already a clean single-prefix data URL
  const singlePrefix = /^data:image\/\w+;base64,[A-Za-z0-9+/=]+$/;
  if (singlePrefix.test(value)) return value;

  // Double-prefix (legacy bug): remove the first data:...;base64, prefix
  const doublePrefix = /^data:image\/\w+;base64,data:image\/\w+;base64,/;
  if (doublePrefix.test(value)) {
    // Find the second occurrence of 'data:'
    const second = value.indexOf("data:", 5);
    if (second > 0) return value.slice(second);
    // Fallback: strip everything up to and including the first 'base64,'
    return value.replace(/^data:image\/\w+;base64,/, "");
  }

  // Raw base64 without prefix — add it
  return `data:image/webp;base64,${value}`;
}
