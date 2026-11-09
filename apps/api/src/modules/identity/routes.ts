import {
  CompleteSignInBodySchema,
  ErrorResponseSchema,
  SessionResponseSchema,
  SignInResponseSchema,
  StartSignInBodySchema,
  StartSignInResponseSchema,
  UserListSchema,
} from "@bb/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { type Authentication, appendSetCookie, clearedLegacyCookies, clearedSessionCookie, sessionCookie } from "@/http";
import type { ApiDeps } from "@/modules/deps";
import { presentSessionUser, presentUserSummary } from "@/modules/presenters";

const errors = { 401: ErrorResponseSchema, 403: ErrorResponseSchema, 422: ErrorResponseSchema, 429: ErrorResponseSchema };

/** Sign-in, the session query, sign-out and the admin user list. */
export function identityRoutes(auth: Authentication, deps: ApiDeps) {
  return (
    new Elysia({ name: "module.identity" })
      .use(auth)
      // Anonymous is a normal answer (200 null), not an error. A dead cookie was already cleared by the macro.
      .get(
        "/auth/session",
        ({ user, request, set }) => {
          appendSetCookie(set, ...clearedLegacyCookies(request.headers.get("cookie")));
          if (!user) return Response.json(null, { headers: { "cache-control": "private, no-store" } });
          return { user: presentSessionUser(user) };
        },
        { optionalAuth: true, response: { 200: SessionResponseSchema } },
      )
      .post("/auth/sign-in/start", ({ body }) => deps.startSignIn.execute(body), {
        body: StartSignInBodySchema,
        response: { 200: StartSignInResponseSchema, ...errors },
      })
      .post(
        "/auth/sign-in/complete",
        async ({ body, request, set }) => {
          const issued = await deps.completeSignIn.execute(body, { userAgent: request.headers.get("user-agent") });
          appendSetCookie(
            set,
            sessionCookie(issued.token, issued.expiresAt, deps.clock.now()),
            ...clearedLegacyCookies(request.headers.get("cookie")),
          );
          return { user: presentSessionUser(issued.user) };
        },
        { body: CompleteSignInBodySchema, response: { 200: SignInResponseSchema, 400: ErrorResponseSchema, ...errors } },
      )
      // Idempotent: signed out already is still 204, and the cookies are cleared either way.
      .post(
        "/auth/sign-out",
        async ({ actor, request, set, status }) => {
          if (actor) await deps.signOut.execute({ sessionId: actor.sessionId });
          appendSetCookie(set, clearedSessionCookie(), ...clearedLegacyCookies(request.headers.get("cookie")));
          return status(204, undefined);
        },
        { optionalAuth: true, response: { 204: z.void() } },
      )
      .get("/users", async ({ actor }) => (await deps.listUsers.execute({ actor })).map(presentUserSummary), {
        auth: true,
        response: { 200: UserListSchema, ...errors },
      })
  );
}
