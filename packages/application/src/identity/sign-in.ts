import { type AuthProvider, BadRequest, BusinessRuleViolation, Forbidden, type User, Unauthenticated, type VerifiedIdentity } from "@bb/domain";
import { type Clock, enforceRateLimit, type RateLimiter } from "@/shared";
import { isEmail, normalizeEmail, normalizePhone } from "./phone";
import type {
  ChallengeKind,
  GoogleVerifier,
  PasswordVerifier,
  Secrets,
  SessionRepository,
  SignInChallengeRepository,
  SignInMessenger,
  UserRepository,
} from "./ports";

const MINUTE = 60;
const LINK_TTL_MS = 15 * 60_000;
const CODE_TTL_MS = 10 * 60_000;
/** Sending: at most 5 links/codes per address per 15 minutes (cost and spam). */
const SEND_LIMIT = { windowSeconds: 15 * MINUTE, max: 5 } as const;
/** Verifying: at most 10 attempts per address per 15 minutes, so a 4- or 6-digit code can't be brute-forced. */
const VERIFY_LIMIT = { windowSeconds: 15 * MINUTE, max: 10 } as const;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

export type StartSignInInput =
  | { readonly provider: "email"; readonly email: string }
  | { readonly provider: "email-code"; readonly email: string }
  | { readonly provider: "phone"; readonly phone: string };

export type CompleteSignInInput =
  | { readonly provider: "google"; readonly credential?: string; readonly accessToken?: string }
  | { readonly provider: "email"; readonly token: string }
  | { readonly provider: "email-code"; readonly email: string; readonly code: string }
  | { readonly provider: "phone"; readonly phone: string; readonly code: string }
  | { readonly provider: "password"; readonly identifier: string; readonly password: string };

const NO_ACCOUNT = "No account found. Ask your club administrator to create one.";

/** Methods switched off by configuration answer like an unknown method: nothing is sent, nothing is verified. */
function ensureEnabled(enabled: ReadonlySet<AuthProvider> | undefined, provider: AuthProvider): void {
  if (enabled && !enabled.has(provider)) throw new BadRequest("This sign-in method is turned off.", "provider_unavailable");
}

interface StartDeps {
  readonly users: UserRepository;
  readonly challenges: SignInChallengeRepository;
  readonly messenger: SignInMessenger;
  readonly secrets: Secrets;
  readonly limiter: RateLimiter;
  readonly clock: Clock;
  readonly appOrigin: string;
  readonly registrationOpen: boolean;
  /** Undefined: every method. */
  readonly enabledProviders?: ReadonlySet<AuthProvider>;
}

/** Sends a magic link or a one-time code. */
export class StartSignIn {
  constructor(private readonly deps: StartDeps) {}

  async execute(input: StartSignInInput): Promise<{ readonly message: string }> {
    const { users, limiter } = this.deps;
    ensureEnabled(this.deps.enabledProviders, input.provider);
    if (input.provider === "phone") {
      const phone = normalizePhone(input.phone);
      if (phone.length < 6) throw new BusinessRuleViolation("Enter a valid phone number.", "invalid_phone");
      await enforceRateLimit(limiter, `sign-in:send:${phone}`, SEND_LIMIT.windowSeconds, SEND_LIMIT.max);
      if (!this.deps.registrationOpen && !(await users.findByPhone(phone))) throw new Forbidden(NO_ACCOUNT);
      const code = this.deps.secrets.numericCode(6);
      await this.store("sms-code", phone, `${phone}:${code}`, CODE_TTL_MS);
      await this.deps.messenger.sendSmsCode(phone, code);
      return { message: "We sent a code to your phone." };
    }

    const email = normalizeEmail(input.email);
    if (!isEmail(email)) throw new BusinessRuleViolation("Enter a valid email address.", "invalid_email");
    await enforceRateLimit(limiter, `sign-in:send:${email}`, SEND_LIMIT.windowSeconds, SEND_LIMIT.max);
    if (!this.deps.registrationOpen && !(await users.findByEmail(email))) throw new Forbidden(NO_ACCOUNT);

    if (input.provider === "email") {
      const token = this.deps.secrets.token();
      await this.store("email-link", email, token, LINK_TTL_MS);
      const link = `${this.deps.appOrigin}/auth/callback?provider=email&token=${encodeURIComponent(token)}`;
      await this.deps.messenger.sendMagicLink(email, link);
      return { message: "We sent a sign-in link to your inbox." };
    }
    const code = this.deps.secrets.numericCode(6);
    await this.store("email-code", email, `${email}:${code}`, CODE_TTL_MS);
    await this.deps.messenger.sendEmailCode(email, code);
    return { message: "We sent a code to your inbox." };
  }

  private store(kind: ChallengeKind, target: string, secret: string, ttlMs: number) {
    const expiresAt = new Date(this.deps.clock.now().getTime() + ttlMs);
    return this.deps.challenges.create({ kind, target, secretHash: this.deps.secrets.hash(secret), expiresAt });
  }
}

interface CompleteDeps {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly challenges: SignInChallengeRepository;
  readonly google: GoogleVerifier;
  readonly passwords: PasswordVerifier;
  readonly secrets: Secrets;
  readonly limiter: RateLimiter;
  readonly clock: Clock;
  readonly registrationOpen: boolean;
  /** Undefined: every method. */
  readonly enabledProviders?: ReadonlySet<AuthProvider>;
}

export interface IssuedSession {
  readonly user: User;
  /** Goes to the client ONLY as an HttpOnly cookie. */
  readonly token: string;
  readonly expiresAt: Date;
}

/** Verifies the credential, finds or creates the account, and opens a session. */
export class CompleteSignIn {
  constructor(private readonly deps: CompleteDeps) {}

  async execute(input: CompleteSignInInput, context: { userAgent: string | null }): Promise<IssuedSession> {
    ensureEnabled(this.deps.enabledProviders, input.provider);
    const identity = await this.verify(input);
    const user = await this.findOrCreate(identity);
    if (!user.isActive) throw new Forbidden("This account is deactivated.");
    const token = this.deps.secrets.token();
    const expiresAt = new Date(this.deps.clock.now().getTime() + SESSION_TTL_MS);
    await this.deps.sessions.create({
      userId: user.id,
      tokenHash: this.deps.secrets.hash(token),
      expiresAt,
      userAgent: context.userAgent?.slice(0, 200) ?? null,
    });
    return { user, token, expiresAt };
  }

  private async verify(input: CompleteSignInInput): Promise<VerifiedIdentity> {
    switch (input.provider) {
      case "google": {
        if (!this.deps.google.configured) throw new BadRequest("Google sign-in is not available.", "provider_unavailable");
        const google = input.accessToken
          ? await this.deps.google.verifyAccessToken(input.accessToken)
          : input.credential
            ? await this.deps.google.verifyIdToken(input.credential)
            : null;
        if (!google) throw new BadRequest("Missing Google credential.");
        return { provider: "google", providerId: google.sub, email: google.email ? normalizeEmail(google.email) : undefined, name: google.name };
      }
      case "email": {
        const challenge = await this.redeem("email-link", input.token, null);
        return { provider: "email", providerId: challenge.target, email: challenge.target };
      }
      case "email-code": {
        const email = normalizeEmail(input.email);
        const challenge = await this.redeem("email-code", `${email}:${input.code.trim()}`, `sign-in:verify:${email}`);
        return { provider: "email-code", providerId: challenge.target, email: challenge.target };
      }
      case "phone": {
        const phone = normalizePhone(input.phone);
        const challenge = await this.redeem("sms-code", `${phone}:${input.code.trim()}`, `sign-in:verify:${phone}`);
        return { provider: "phone", providerId: challenge.target, phone: challenge.target };
      }
      case "password":
        return this.verifyPassword(input.identifier, input.password);
    }
  }

  /**
   * Every attempt is counted before it is checked (atomic, so parallel guessing can't slip past the limit); a correct
   * one is given back, so only failures use up the budget.
   */
  private async limited<T>(key: string, attempt: () => Promise<T>): Promise<T> {
    await enforceRateLimit(this.deps.limiter, key, VERIFY_LIMIT.windowSeconds, VERIFY_LIMIT.max);
    const result = await attempt();
    await this.deps.limiter.refund(key, VERIFY_LIMIT.windowSeconds).catch(() => undefined);
    return result;
  }

  /** One-time secrets: unknown, expired and used all answer the same, so nothing is revealed. */
  private redeem(kind: ChallengeKind, secret: string, limitKey: string | null) {
    return limitKey ? this.limited(limitKey, () => this.check(kind, secret)) : this.check(kind, secret);
  }

  private async check(kind: ChallengeKind, secret: string) {
    const invalid = new Unauthenticated(
      kind === "email-link" ? "This link is invalid or has expired." : "This code is invalid or has expired.",
      "invalid_code",
    );
    const challenge = await this.deps.challenges.findBySecretHash(this.deps.secrets.hash(secret));
    if (!challenge || challenge.kind !== kind || challenge.used) throw invalid;
    if (challenge.expiresAt.getTime() < this.deps.clock.now().getTime()) throw invalid;
    if (!(await this.deps.challenges.consume(challenge.id))) throw invalid;
    return challenge;
  }

  private async verifyPassword(identifier: string, password: string): Promise<VerifiedIdentity> {
    const raw = identifier.trim();
    const email = raw.includes("@") ? normalizeEmail(raw) : "";
    const phone = email ? "" : normalizePhone(raw);
    if (!email && !phone) throw new BadRequest("Enter your email or phone number.");
    return this.limited(`sign-in:password:${email || phone}`, async (): Promise<VerifiedIdentity> => {
      const user = email ? await this.deps.users.findByEmail(email) : await this.deps.users.findByPhone(phone);
      const invalid = new Unauthenticated("Wrong email/phone or password.", "invalid_credentials");
      if (!user?.passwordHash || !password) throw invalid;
      if (!(await this.deps.passwords.verify(password, user.passwordHash))) throw invalid;
      return { provider: "password", providerId: email || phone, email: user.email ?? undefined, phone: user.phone ?? undefined };
    });
  }

  /** Same person, one account: an unknown sign-in method is linked to the account with that email or phone. */
  private async findOrCreate(identity: VerifiedIdentity): Promise<User> {
    const { users } = this.deps;
    const linked = await users.findByAuthMethod(identity.provider, identity.providerId);
    if (linked) return linked;
    const existing = identity.email
      ? await users.findByEmail(identity.email)
      : identity.phone
        ? await users.findByPhone(identity.phone)
        : null;
    if (existing) {
      await users.linkAuthMethod(existing.id, identity.provider, identity.providerId);
      return existing;
    }
    if (!this.deps.registrationOpen) throw new Forbidden(NO_ACCOUNT);
    return users.create({
      email: identity.email,
      phone: identity.phone,
      name: identity.name,
      provider: identity.provider,
      providerId: identity.providerId,
    });
  }
}
