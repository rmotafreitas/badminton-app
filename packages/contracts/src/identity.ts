import { z } from "zod";
import { IdSchema, ImageUrlSchema, RoleSchema } from "./common";

/** `POST /api/auth/sign-in/start`: send a magic link or a code. */
export const StartSignInBodySchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("email"), email: z.string().max(254) }),
  z.object({ provider: z.literal("email-code"), email: z.string().max(254) }),
  z.object({ provider: z.literal("phone"), phone: z.string().max(32) }),
]);
export type StartSignInBody = z.infer<typeof StartSignInBodySchema>;
export const StartSignInResponseSchema = z.object({ message: z.string() });

/** `POST /api/auth/sign-in/complete`: verify the credential; the session arrives as an HttpOnly cookie. */
export const CompleteSignInBodySchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("google"),
    credential: z.string().max(4096).optional(),
    accessToken: z.string().max(4096).optional(),
  }),
  z.object({ provider: z.literal("email"), token: z.string().min(16).max(128) }),
  z.object({ provider: z.literal("email-code"), email: z.string().max(254), code: z.string().min(4).max(8) }),
  z.object({ provider: z.literal("phone"), phone: z.string().max(32), code: z.string().min(4).max(8) }),
  z.object({ provider: z.literal("password"), identifier: z.string().min(1).max(254), password: z.string().min(1).max(256) }),
]);
export type CompleteSignInBody = z.infer<typeof CompleteSignInBodySchema>;

/** The signed-in person, as every page needs it (header, permissions, ratings). Never contains a token. */
export const SessionUserSchema = z.object({
  id: IdSchema,
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  roles: z.array(RoleSchema),
  clubId: IdSchema.nullable(),
  eloSingles: z.number(),
  eloDoubles: z.number(),
  photoUrl: ImageUrlSchema,
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

/**
 * `GET /api/auth/session`: `{ user }` when signed in, `null` when anonymous. Being anonymous is a normal answer
 * (200), not an error, so public pages make no 401 noise.
 */
export const SessionResponseSchema = z.object({ user: SessionUserSchema }).nullable();
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const SignInResponseSchema = z.object({ user: SessionUserSchema });

/** `GET /api/users` (system admins). */
export const UserSummarySchema = SessionUserSchema.omit({ eloSingles: true, eloDoubles: true });
export type UserSummary = z.infer<typeof UserSummarySchema>;
export const UserListSchema = z.array(UserSummarySchema);
