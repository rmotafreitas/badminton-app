/** Image URLs carry the content version, so the browser can cache them forever (see `immutableImage`). */
export const profileImageUrl = (userId: string, kind: "photo" | "banner", version: string | null): string | null =>
  version ? `/api/media/profiles/${userId}/${kind}/${version}` : null;

export const clubImageUrl = (clubId: string, kind: "picture" | "banner", version: string | null): string | null =>
  version ? `/api/media/clubs/${clubId}/${kind}/${version}` : null;

/** Multipart file → the use cases' upload type: an empty file means "remove". */
export async function toUpload(file: File | undefined) {
  if (!file) return undefined;
  if (file.size === 0) return { kind: "remove" as const };
  return { kind: "set" as const, bytes: new Uint8Array(await file.arrayBuffer()) };
}
