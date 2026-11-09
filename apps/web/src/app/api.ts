import type { App } from "@bb/api";
import type { ErrorResponse } from "@bb/contracts";
import { type Treaty, treaty } from "@elysiajs/eden";

/** A non-2xx answer, as a real error so Query, the router and the error boundaries all see it. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly status: number,
    /** `ErrorResponse.code`; `unknown_error` when the body was not one (a proxy's HTML page, say). */
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
    readonly issues?: readonly { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** The request never got an answer: offline, DNS, TLS, a dropped connection. Not a logout, not a 5xx. */
export class NetworkError extends Error {
  override readonly name = "NetworkError";
  constructor(options?: ErrorOptions) {
    super("The server could not be reached.", options);
  }
}

export const isApiError = (error: unknown, status?: number): error is ApiError =>
  error instanceof ApiError && (status === undefined || error.status === status);

/** A 4xx other than a throttle is a definite answer; asking again won't change it. */
export const isClientError = (error: unknown): boolean =>
  error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429;

/** The server could not be asked, or could not answer. Never evidence the session ended. */
export const isUnavailable = (error: unknown): boolean =>
  error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The server's CSRF guard answers 403 to a cookie-bearing write that isn't JSON or multipart, even without a body
 * (sign-out, DELETE). Eden only sets the header when there IS a body, so every write goes through here.
 */
function jsonOnWrites(fetcher: Fetcher): Fetcher {
  return (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (SAFE_METHODS.has(method) || init?.body instanceof FormData) return fetcher(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return fetcher(input, { ...init, headers });
  };
}

/**
 * Typed API client (Eden Treaty). Request and response types are inferred from the API's routes, which declare the
 * shared zod contracts in @bb/contracts: client/server drift is a compile error. Same origin as the page, so the
 * session cookie just works. Eden does not validate responses at runtime.
 */
export type Api = Treaty.Create<App>["api"];

export function createApi(fetcher: Fetcher = (input, init) => globalThis.fetch(input, init), origin = window.location.origin): Api {
  // parseDate: false — Eden would otherwise turn ISO strings into Date objects, so the runtime values would no longer
  // match the contract types (and the persisted cache would round-trip them back to strings).
  const client: Treaty.Create<App> = treaty<App>(origin, { fetcher: jsonOnWrites(fetcher) as typeof fetch, parseDate: false });
  return client.api;
}

interface EdenResult {
  data: unknown;
  error: unknown;
  response?: Response | undefined;
}

/** An `ErrorResponse` body becomes an ApiError; anything else (a proxy's HTML page, say) a generic one. */
function toApiError(status: number, value: unknown): ApiError {
  const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  if (typeof body.code !== "string" || typeof body.message !== "string") {
    return new ApiError(status, "unknown_error", `The request failed (HTTP ${status}).`);
  }
  const { code, message, requestId, retryAfterSeconds, issues } = body as ErrorResponse;
  return new ApiError(status, code, message, requestId, retryAfterSeconds, issues);
}

/**
 * Eden resolves with `{ data, error }`. Unwrap it into the data, or throw: `NetworkError` when there was no answer at
 * all, otherwise `ApiError(status, code)`. `data` may legitimately be `null` (anonymous session).
 */
export function unwrap<R extends EdenResult>(result: R): Extract<R, { error: null }>["data"] {
  if (result.error === null || result.error === undefined) return result.data as Extract<R, { error: null }>["data"];
  const error = result.error as { status?: unknown; value?: unknown };
  if (result.response === undefined) throw new NetworkError({ cause: error.value });
  throw toApiError(typeof error.status === "number" ? error.status : result.response.status, error.value);
}

/** Multipart writes (images) go through plain fetch: Eden would serialise them, and we want FormData as-is. */
export async function sendForm<T>(method: "POST" | "PATCH", path: string, form: FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method, body: form, credentials: "same-origin" });
  } catch (cause) {
    throw new NetworkError({ cause });
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response.status, body);
  return body as T;
}

/** An optional image in a multipart form: a File sets it, `null` removes it (an empty file), `undefined` leaves it. */
export function setImageField(form: FormData, key: string, file: File | null | undefined) {
  if (file === null) form.set(key, new File([], "empty"));
  else if (file) form.set(key, file);
}
