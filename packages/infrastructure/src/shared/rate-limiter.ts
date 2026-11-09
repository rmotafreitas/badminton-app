import type { RateLimiter, RateLimitResult } from "@bb/application";
import type { Database } from "./database";

/**
 * Fixed-window counter in MongoDB: one document per (key, window). The upsert increments atomically, so two
 * concurrent attempts can't both slip under the limit. A Redis adapter (INCR + EXPIRE) would be a drop-in.
 */
export class MongoRateLimiter implements RateLimiter {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private windowStart(windowSeconds: number): Date {
    const windowMs = windowSeconds * 1000;
    return new Date(Math.floor(this.now().getTime() / windowMs) * windowMs);
  }

  async hit(key: string, windowSeconds: number, max: number): Promise<RateLimitResult> {
    const windowStart = this.windowStart(windowSeconds);
    const expiresAt = new Date(windowStart.getTime() + windowSeconds * 1000);
    try {
      const bucket = await this.db.rateLimitBucket.upsert({
        where: { key_windowStart: { key, windowStart } },
        create: { key, windowStart, count: 1, expiresAt },
        update: { count: { increment: 1 } },
      });
      if (bucket.count <= max) return { allowed: true, retryAfterSeconds: 0 };
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - this.now().getTime()) / 1000)) };
    } catch {
      // Fail open: a limiter outage must not lock everyone out of signing in.
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }

  async refund(key: string, windowSeconds: number): Promise<void> {
    const windowStart = this.windowStart(windowSeconds);
    await this.db.rateLimitBucket.updateMany({ where: { key, windowStart, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
  }

  async purgeExpired(now: Date): Promise<number> {
    return (await this.db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } })).count;
  }
}
