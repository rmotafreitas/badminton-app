import type { ErrorResponse } from "@bb/contracts";
import { Elysia } from "elysia";
import { hasCookie, SESSION_COOKIE } from "./cookies";
import { currentRequestId } from "./request-context";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_TYPES = /^(application\/json|multipart\/form-data)\b/i;

/**
 * CSRF guard. `SameSite=Lax` is the first line; this is the second. A state-changing request that carries the session
 * cookie must come from our own origin (`Origin` equal to the app origin) and be JSON or a multipart upload. Anything
 * else is refused with 403 before routing, so no handler can forget it. There is deliberately NO CORS: the web app
 * reaches the API on its own origin (Vercel rewrite / Vite proxy), so cross-origin scripts can't read responses.
 */
export function csrfGuard(appOrigin: string) {
  const allowed = new URL(appOrigin).origin;
  return new Elysia({ name: "http.csrf" }).onRequest(({ request, set }) => {
    if (SAFE_METHODS.has(request.method) || !hasCookie(request.headers.get("cookie"), SESSION_COOKIE)) return;
    const refusal =
      request.headers.get("origin") !== allowed
        ? "Cross-origin request refused."
        : !ALLOWED_TYPES.test(request.headers.get("content-type")?.trim() ?? "")
          ? "Send state-changing requests as application/json."
          : undefined;
    if (!refusal) return;
    set.status = 403;
    return { code: "forbidden", message: refusal, requestId: currentRequestId(set) } satisfies ErrorResponse;
  });
}
