import { Elysia } from "elysia";

/** A caller-supplied id is kept only if it is short and boring (it ends up in logs). */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Runs before routing, so even 404s and validation failures get both headers:
 * - `x-request-id` correlates a response (and its error body) with server logs;
 * - `Cache-Control: private, no-store` is the default for EVERY /api response, so no shared cache (Vercel's edge,
 *   a proxy) and no browser heuristic ever stores user data. Only immutable images opt out (`immutableImage`).
 */
export const requestContext = new Elysia({ name: "http.request-context" })
  .onRequest(({ request, set }) => {
    const incoming = request.headers.get("x-request-id");
    set.headers["x-request-id"] = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
    set.headers["cache-control"] = "private, no-store";
    // JSON and images only: never sniffed, never framed, no referrer leaks of ids in URLs.
    set.headers["x-content-type-options"] = "nosniff";
    set.headers["x-frame-options"] = "DENY";
    set.headers["referrer-policy"] = "strict-origin-when-cross-origin";
  })
  .derive({ as: "global" }, ({ set }) => ({ requestId: currentRequestId(set) }));

export function currentRequestId(set: { headers: Record<string, unknown> }): string {
  const id = set.headers["x-request-id"];
  return typeof id === "string" ? id : "unknown";
}

/** For content-addressed URLs only (the version is in the path): the browser keeps it for a year, privately. */
export function immutableImage(set: { headers: Record<string, unknown> }): void {
  set.headers["cache-control"] = "private, max-age=31536000, immutable";
}
