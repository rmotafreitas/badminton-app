import type { Actor, User } from "@bb/domain";
import type { Clock } from "@/shared";
import type { Secrets, SessionRepository, UserRepository } from "./ports";
import { SESSION_TTL_MS } from "./sign-in";

/** A session is extended (sliding expiry) once less than this much of it is left. */
const RENEW_BELOW_MS = 15 * 24 * 60 * 60_000;
const LAST_ACCESS_EVERY_MS = 60 * 60_000;

export interface ResolvedSession {
  readonly actor: Actor;
  readonly user: User;
  /** Set when the expiry moved: the cookie must be re-sent with the new Max-Age. */
  readonly renewedUntil: Date | null;
}

/** Token → actor, on every authenticated request. Unknown, expired, or deactivated → null. */
export class ResolveSession {
  constructor(
    private readonly deps: { sessions: SessionRepository; users: UserRepository; secrets: Secrets; clock: Clock },
  ) {}

  async execute({ token }: { token: string }): Promise<ResolvedSession | null> {
    if (token.length < 20 || token.length > 128) return null;
    const session = await this.deps.sessions.findByTokenHash(this.deps.secrets.hash(token));
    if (!session) return null;
    const now = this.deps.clock.now().getTime();
    if (session.expiresAt.getTime() <= now) {
      await this.deps.sessions.delete(session.id);
      return null;
    }
    const user = await this.deps.users.findById(session.userId);
    if (!user?.isActive) return null;
    // "Last seen", at most one write an hour per person (every request resolves the session).
    if (!user.lastAccess || now - user.lastAccess.getTime() > LAST_ACCESS_EVERY_MS) {
      await this.deps.users.touch(user.id, new Date(now));
    }
    let renewedUntil: Date | null = null;
    if (session.expiresAt.getTime() - now < RENEW_BELOW_MS) {
      renewedUntil = new Date(now + SESSION_TTL_MS);
      await this.deps.sessions.extend(session.id, renewedUntil);
    }
    return {
      actor: { userId: user.id, sessionId: session.id, roles: user.roles, clubId: user.clubId },
      user,
      renewedUntil,
    };
  }
}

export class SignOut {
  constructor(private readonly deps: { sessions: SessionRepository }) {}
  execute({ sessionId }: { sessionId: string }): Promise<void> {
    return this.deps.sessions.delete(sessionId);
  }
}
