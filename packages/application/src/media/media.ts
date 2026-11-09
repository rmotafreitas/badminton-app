import { isObjectId, NotFound } from "@bb/domain";
import type { ClubRepository } from "@/clubs";
import type { ProfileRepository } from "@/profiles";

export type ImageOwner = "profile" | "club";
export type ImageKind = "photo" | "picture" | "banner";

export interface DecodedImage {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/**
 * Stored images are data URLs (some legacy rows: raw base64, or a doubled prefix). This turns any of them into bytes
 * so they can be served as a real, cacheable image instead of being inlined into every JSON response.
 */
export function decodeStoredImage(value: string): DecodedImage | null {
  const prefixed = /^(?:data:(image\/[\w.+-]+);base64,)+(.*)$/s.exec(value);
  const contentType = prefixed?.[1] ?? "image/webp";
  let base64 = (prefixed?.[2] ?? value).replace(/\s/g, "").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]+$/.test(base64)) return null;
  // Browsers decoded the old data URLs leniently; some stored ones have a stray trailing character or no padding.
  if (base64.length % 4 === 1) base64 = base64.slice(0, -1);
  base64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return bytes.length > 0 ? { bytes, contentType } : null;
  } catch {
    return null;
  }
}

/** Profile photos/banners and club pictures/banners, for any signed-in user (they appear in rosters and games). */
export class GetImage {
  constructor(private readonly deps: { profiles: ProfileRepository; clubs: ClubRepository }) {}

  async execute({ owner, id, kind }: { owner: ImageOwner; id: string; kind: ImageKind }): Promise<DecodedImage> {
    if (!isObjectId(id)) throw new NotFound();
    let stored: string | null = null;
    if (owner === "profile" && (kind === "photo" || kind === "banner")) stored = await this.deps.profiles.getImage(id, kind);
    if (owner === "club" && (kind === "picture" || kind === "banner")) stored = await this.deps.clubs.getImage(id, kind);
    const image = stored ? decodeStoredImage(stored) : null;
    if (!image) throw new NotFound();
    return image;
  }
}
