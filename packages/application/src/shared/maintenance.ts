import type { SessionRepository, SignInChallengeRepository } from "@/identity/ports";
import type { Clock, HealthProbe, RateLimiter } from "./ports";

/** Daily cron: expired sessions, sign-in codes/links and rate-limit windows are deleted, so collections stay small. */
export class PurgeExpiredCredentials {
  constructor(
    private readonly deps: { sessions: SessionRepository; challenges: SignInChallengeRepository; limiter: RateLimiter; clock: Clock },
  ) {}

  async execute(): Promise<{ sessions: number; challenges: number; rateLimits: number }> {
    const now = this.deps.clock.now();
    const [sessions, challenges, rateLimits] = await Promise.all([
      this.deps.sessions.deleteExpired(now),
      this.deps.challenges.deleteExpired(now),
      this.deps.limiter.purgeExpired(now),
    ]);
    return { sessions, challenges, rateLimits };
  }
}

/** `GET /api/health/ready`: 200 only when the database answers (load balancers, uptime checks). */
export class CheckReadiness {
  constructor(private readonly deps: { health: HealthProbe }) {}
  async execute(): Promise<{ ready: boolean; checks: { database: boolean } }> {
    const database = await this.deps.health.database().catch(() => false);
    return { ready: database, checks: { database } };
  }
}
