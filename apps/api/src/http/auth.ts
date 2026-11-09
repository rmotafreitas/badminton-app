import type { Clock, ResolvedSession, ResolveSession } from "@bb/application";
import type { ErrorResponse } from "@bb/contracts";
import type { Actor, User } from "@bb/domain";
import { Elysia } from "elysia";
import { appendSetCookie, clearedSessionCookie, readCookie, SESSION_COOKIE, sessionCookie } from "./cookies";
import { currentRequestId } from "./request-context";

const unauthenticated = (set: { headers: Record<string, unknown> }): ErrorResponse => ({
  code: "unauthenticated",
  message: "Sign in to continue.",
  requestId: currentRequestId(set),
});

/**
 * Authentication. Two macros; both return `status(401, ErrorResponse)` instead of throwing:
 * - `auth: true`         the route needs a signed-in actor; without one it never runs.
 * - `optionalAuth: true` the route also works signed out (`actor` and `user` are null).
 * A session close to expiry is extended (sliding), and the cookie re-sent with its new Max-Age.
 * Authorization (who may do what) is NOT here: it lives in the use cases.
 */
export function authentication(resolveSession: Pick<ResolveSession, "execute">, clock: Clock) {
  const resolve = async (request: Request, set: { headers: Record<string, unknown> }): Promise<ResolvedSession | null> => {
    const header = request.headers.get("cookie");
    const token = readCookie(header, SESSION_COOKIE);
    if (!token) return null;
    const resolved = await resolveSession.execute({ token });
    if (!resolved) {
      appendSetCookie(set, clearedSessionCookie());
      return null;
    }
    if (resolved.renewedUntil) appendSetCookie(set, sessionCookie(token, resolved.renewedUntil, clock.now()));
    return resolved;
  };

  return new Elysia({ name: "http.auth" }).macro({
    auth: {
      async resolve({ request, set, status }) {
        const session = await resolve(request, set);
        if (!session) return status(401, unauthenticated(set));
        return { actor: session.actor as Actor, user: session.user as User };
      },
    },
    optionalAuth: {
      async resolve({ request, set }) {
        const session = await resolve(request, set);
        return { actor: (session?.actor ?? null) as Actor | null, user: (session?.user ?? null) as User | null };
      },
    },
  });
}

export type Authentication = ReturnType<typeof authentication>;
