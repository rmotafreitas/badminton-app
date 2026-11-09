import type { AuthProvider, Role, User } from "@bb/domain";

export interface CreateUserInput {
  readonly email?: string;
  readonly phone?: string;
  readonly name?: string;
  readonly provider: AuthProvider;
  readonly providerId: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByIds(ids: readonly string[]): Promise<User[]>;
  findByEmail(email: string): Promise<User | null>;
  /** `phone` is already normalised (`normalizePhone`). */
  findByPhone(phone: string): Promise<User | null>;
  findByAuthMethod(provider: AuthProvider, providerId: string): Promise<User | null>;
  /** Creates the user, its first sign-in method and an empty profile together. */
  create(input: CreateUserInput): Promise<User>;
  linkAuthMethod(userId: string, provider: AuthProvider, providerId: string): Promise<void>;
  setClub(userId: string, clubId: string | null): Promise<void>;
  /** Moves every member of a club to "no club" (before the club is deleted). */
  clearClub(clubId: string): Promise<void>;
  listAll(): Promise<User[]>;
  setRoles(userId: string, roles: readonly Role[]): Promise<void>;
  /** Writes many players' ratings at once (after a game, or a replay). */
  setRatings(updates: readonly { userId: string; eloSingles?: number; eloDoubles?: number }[]): Promise<void>;
}

export interface StoredSession {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

/** Opaque server-side sessions (ASMR ADR-0002): only the token's hash is stored, so a database leak grants nothing. */
export interface SessionRepository {
  create(input: { userId: string; tokenHash: string; expiresAt: Date; userAgent: string | null }): Promise<StoredSession>;
  findByTokenHash(tokenHash: string): Promise<StoredSession | null>;
  extend(id: string, expiresAt: Date): Promise<void>;
  delete(id: string): Promise<void>;
  /** Housekeeping: removes sessions that expired before `now`. Returns how many. */
  deleteExpired(now: Date): Promise<number>;
}

export type ChallengeKind = "email-link" | "email-code" | "sms-code";

export interface SignInChallenge {
  readonly id: string;
  readonly kind: ChallengeKind;
  /** The email address or phone number it was sent to. */
  readonly target: string;
  readonly expiresAt: Date;
  readonly used: boolean;
}

/** One-time sign-in links and codes. Only hashes are stored. */
export interface SignInChallengeRepository {
  create(input: { kind: ChallengeKind; target: string; secretHash: string; expiresAt: Date }): Promise<void>;
  findBySecretHash(secretHash: string): Promise<SignInChallenge | null>;
  /** Marks it used. False when it was already used (a concurrent redeem lost the race). */
  consume(id: string): Promise<boolean>;
  /** Housekeeping: removes links/codes that expired before `now`. Returns how many. */
  deleteExpired(now: Date): Promise<number>;
}

/** Random secrets and their one-way hashes. */
export interface Secrets {
  /** 256-bit URL-safe token. */
  token(): string;
  /** `digits`-long numeric code, uniformly random. */
  numericCode(digits: number): string;
  hash(secret: string): string;
}

export interface PasswordVerifier {
  verify(password: string, hash: string): Promise<boolean>;
}

export interface GoogleIdentity {
  readonly sub: string;
  readonly email?: string;
  readonly name?: string;
}

/** Verifies Google's ID token (Sign in with Google button) or access token (one-tap / popup flow). */
export interface GoogleVerifier {
  readonly configured: boolean;
  verifyIdToken(credential: string): Promise<GoogleIdentity>;
  verifyAccessToken(accessToken: string): Promise<GoogleIdentity>;
}

/** Email and SMS delivery of sign-in secrets. */
export interface SignInMessenger {
  sendMagicLink(email: string, link: string): Promise<void>;
  sendEmailCode(email: string, code: string): Promise<void>;
  sendSmsCode(phone: string, code: string): Promise<void>;
}
