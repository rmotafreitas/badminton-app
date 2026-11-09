/**
 * Every rule violation the domain or a use case can report. `apps/api/src/http/errors.ts` is the ONLY place these
 * become HTTP statuses; nothing below the HTTP layer knows about status codes.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The request is malformed in a way the schema could not catch (400). */
export class BadRequest extends DomainError {
  readonly code: string;
  constructor(message = "The request could not be understood.", code = "bad_request") {
    super(message);
    this.code = code;
  }
}

/** No valid session, or the credentials were wrong (401). */
export class Unauthenticated extends DomainError {
  readonly code: string;
  constructor(message = "Sign in to continue.", code = "unauthenticated") {
    super(message);
    this.code = code;
  }
}

/** Signed in, but not allowed (403). Use NotFound when even the resource's existence is private. */
export class Forbidden extends DomainError {
  readonly code = "forbidden";
  constructor(message = "You don't have access to this.") {
    super(message);
  }
}

export class NotFound extends DomainError {
  readonly code = "not_found";
  constructor(message = "Not found.") {
    super(message);
  }
}

export class Conflict extends DomainError {
  readonly code: string;
  constructor(message = "This conflicts with the current state.", code = "conflict") {
    super(message);
    this.code = code;
  }
}

/** Well-formed input that breaks a rule (422). */
export class BusinessRuleViolation extends DomainError {
  readonly code: string;
  constructor(message: string, code = "rule_violation") {
    super(message);
    this.code = code;
  }
}

/** Storage quota or payload limits (413). */
export class QuotaExceeded extends DomainError {
  readonly code = "quota_exceeded";
}

export class RateLimited extends DomainError {
  readonly code = "rate_limited";
  constructor(
    readonly retryAfterSeconds: number,
    message = "Too many attempts. Try again later.",
  ) {
    super(message);
  }
}
