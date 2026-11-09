/** Cross-cutting ports. Adapters live in @bb/infrastructure; tests pass plain objects. */

export interface Clock {
  now(): Date;
}

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Seconds until the window resets; 0 when allowed. */
  readonly retryAfterSeconds: number;
}

/** Fixed-window counter (ADR-0008 §2 of the ASMR app): MongoDB now, Redis is a drop-in adapter later. */
export interface RateLimiter {
  hit(key: string, windowSeconds: number, max: number): Promise<RateLimitResult>;
  /** Gives back one hit of the current window (a sign-in that succeeded shouldn't use up the failure budget). */
  refund(key: string, windowSeconds: number): Promise<void>;
  /** Housekeeping: drops windows that ended before `now`. Returns how many. */
  purgeExpired(now: Date): Promise<number>;
}

/** Readiness of the things the API can't work without. */
export interface HealthProbe {
  database(): Promise<boolean>;
}

/**
 * A read-through cache seam. Default adapter is `NoopCache`; only immutable or staleness-tolerant data may ever be
 * cached, and a cache failure is a miss (fail open).
 */
export interface Cache {
  getOrLoad<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T>;
  delete(key: string): Promise<void>;
}

/** S3-compatible object storage (R2 in production, SeaweedFS locally). */
export interface ObjectStorage {
  /** False when no bucket is configured: stats still work, videos stay on the device. */
  readonly configured: boolean;
  presignPut(key: string, contentType: string, expiresSeconds: number): Promise<string>;
  presignGet(key: string, expiresSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface ProcessedImage {
  /** `data:image/webp;base64,...` — how images are stored today. */
  readonly dataUrl: string;
  /** Short content hash: part of the image URL, so the browser can cache it forever. */
  readonly version: string;
}

export interface ImageProcessor {
  toWebp(bytes: Uint8Array, options: { maxWidth: number; maxHeight: number; quality: number }): Promise<ProcessedImage>;
}

/** An uploaded file: present with bytes, or an explicit "remove" (empty upload). */
export type ImageUpload = { readonly kind: "set"; readonly bytes: Uint8Array } | { readonly kind: "remove" };
