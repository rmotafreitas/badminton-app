import type { Logger } from "@bb/application";
import type { ErrorResponse } from "@bb/contracts";
import {
  BadRequest,
  BusinessRuleViolation,
  Conflict,
  DomainError,
  Forbidden,
  NotFound,
  QuotaExceeded,
  RateLimited,
  Unauthenticated,
} from "@bb/domain";
import { Elysia } from "elysia";
import { currentRequestId } from "./request-context";

/** The ONLY place domain errors become HTTP statuses. */
const STATUS_BY_ERROR: ReadonlyArray<readonly [abstract new (...args: never[]) => DomainError, number]> = [
  [BadRequest, 400],
  [Unauthenticated, 401],
  [Forbidden, 403],
  [NotFound, 404],
  [Conflict, 409],
  [QuotaExceeded, 413],
  [BusinessRuleViolation, 422],
  [RateLimited, 429],
];

interface ValidationLike {
  type?: string;
  all?: ReadonlyArray<{ path?: string; message?: string; summary?: string }>;
}

type ErrorBody = Omit<ErrorResponse, "requestId">;
const INTERNAL: ErrorBody = { code: "internal", message: "Something went wrong. Try again in a moment." };

function toErrorReply(code: unknown, error: unknown): { status: number; body: ErrorBody; logAs?: string } {
  if (error instanceof DomainError) {
    const status = STATUS_BY_ERROR.find(([type]) => error instanceof type)?.[1] ?? 500;
    const retry = error instanceof RateLimited ? { retryAfterSeconds: error.retryAfterSeconds } : {};
    return { status, body: { code: error.code, message: error.message, ...retry } };
  }
  if (code === "VALIDATION") {
    const validation = error as ValidationLike;
    // A response that breaks its own contract is a server bug, not the client's fault.
    if (validation.type === "response") return { status: 500, body: INTERNAL, logAs: "response failed its contract" };
    const issues = (validation.all ?? []).slice(0, 20).map((issue) => ({
      path: issue.path ?? "",
      message: issue.summary ?? issue.message ?? "Invalid value.",
    }));
    return { status: 422, body: { code: "validation_failed", message: "Some fields are invalid.", issues } };
  }
  if (code === "PARSE") return { status: 400, body: { code: "bad_request", message: "The request body could not be read." } };
  if (code === "NOT_FOUND") return { status: 404, body: { code: "not_found", message: "Not found." } };
  return { status: 500, body: INTERNAL, logAs: "unhandled error" };
}

/**
 * Global error mapping. Every non-2xx body matches `ErrorResponseSchema`; no stack traces or internal messages reach
 * the client. Server bugs are logged with the request id the client receives.
 */
export function errorHandling(log: Logger) {
  return new Elysia({ name: "http.errors" }).onError({ as: "global" }, ({ code, error, set, request }) => {
    const requestId = currentRequestId(set);
    const { status, body, logAs } = toErrorReply(code, error);
    if (logAs) {
      log.error(logAs, {
        requestId,
        path: new URL(request.url).pathname,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    set.status = status;
    set.headers["cache-control"] = "private, no-store";
    if (body.retryAfterSeconds !== undefined) set.headers["retry-after"] = String(body.retryAfterSeconds);
    return { ...body, requestId } satisfies ErrorResponse;
  });
}
