import { RateLimited } from "@bb/domain";
import type { RateLimiter } from "./ports";

/** Throws `RateLimited` when the key is over its budget. */
export async function enforceRateLimit(limiter: RateLimiter, key: string, windowSeconds: number, max: number): Promise<void> {
  const result = await limiter.hit(key, windowSeconds, max);
  if (!result.allowed) throw new RateLimited(result.retryAfterSeconds);
}
