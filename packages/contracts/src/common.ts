import { z } from "zod";

/**
 * Body of every non-2xx API response. `code` is stable and machine-readable, `message` is safe to show, `requestId`
 * correlates with server logs. Never contains stack traces.
 */
export const ErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  /** On 422 validation failures: which fields were wrong. */
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  /** On 429. */
  retryAfterSeconds: z.number().int().nonnegative().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const IdSchema = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id.");
export const IdParamsSchema = z.object({ id: IdSchema });
export const IsoDateTime = z.iso.datetime();
export const CalendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const RoleSchema = z.enum(["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"]);
export type Role = z.infer<typeof RoleSchema>;

export const OkSchema = z.object({ ok: z.literal(true) });

/** A URL path to a cacheable image (`/api/media/...`), or null when there is none. */
export const ImageUrlSchema = z.string().nullable();

/** A multipart image upload. An empty file removes the image; a missing field leaves it alone. */
export const ImageFileSchema = z.file().max(10 * 1024 * 1024).optional();
