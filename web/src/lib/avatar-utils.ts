/**
 * Avatar fallback utilities — used by the mapper layer so that domain objects
 * always carry a displayable avatar. Components never need to handle the
 * "no photo" case themselves.
 *
 * Priority for generating initials: name → email (local part) → id → "?".
 */

/**
 * Extract initials from a text string.
 *
 * Rules (per spec):
 *   - 2+ words: first letter of first word (cap) + first letter of last word (cap)
 *   - 1 word, 2+ chars: first two letters capitalized
 *   - 1 word, 1 char: just that letter capitalized
 */
export function getInitials(text: string | null | undefined): string {
  if (!text) return "";
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";

  if (parts.length >= 2) {
    return (
      parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
    ).toUpperCase();
  }

  const word = parts[0];
  if (word.length >= 2) {
    return (word.charAt(0) + word.charAt(1)).toUpperCase();
  }
  return word.charAt(0).toUpperCase();
}

/** Extract the local part of an email (before @). */
function emailLocalPart(email: string | null | undefined): string | null {
  if (!email) return null;
  const atIdx = email.indexOf("@");
  if (atIdx <= 0) return null;
  return email.slice(0, atIdx);
}

/** Pick a deterministic background color from a seed string. */
function colorForSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 55%)`;
}

/**
 * Generate an inline SVG data URI with the initials on a colored circle.
 * No external API call — works offline and is instant.
 */
function buildInitialsSvg(initials: string, seed: string): string {
  const bg = colorForSeed(seed);
  const safe = initials
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${bg}"/><text x="32" y="32" dy="0.35em" text-anchor="middle" font-family="Inter,Poppins,sans-serif" font-size="26" font-weight="700" fill="white">${safe}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Produce a fallback avatar data URI.
 *
 * Priority: name → email (local part before @) → id → "?".
 * Each candidate uses the same initials extraction logic.
 */
export function fallbackAvatar(
  name?: string | null,
  email?: string | null,
  id?: string | null,
): string {
  const seed = name || emailLocalPart(email) || id || "?";
  const initials =
    getInitials(name) ||
    getInitials(emailLocalPart(email)) ||
    getInitials(id) ||
    "?";
  return buildInitialsSvg(initials, seed);
}
