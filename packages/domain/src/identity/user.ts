export const ROLES = ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"] as const;
export type Role = (typeof ROLES)[number];

export const AUTH_PROVIDERS = ["google", "email", "email-code", "phone", "password"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const DEFAULT_RATING = 200;

export interface User {
  readonly id: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly passwordHash: string | null;
  readonly roles: readonly Role[];
  readonly eloSingles: number;
  readonly eloDoubles: number;
  readonly isActive: boolean;
  readonly clubId: string | null;
  readonly createdAt: Date;
  /** Last time the account used the app (written at most hourly). */
  readonly lastAccess: Date | null;
  /** Display data from the profile, when the repository loaded it. */
  readonly name: string | null;
  readonly photoVersion: string | null;
}

/** What a provider proved about the person signing in. */
export interface VerifiedIdentity {
  readonly provider: AuthProvider;
  readonly providerId: string;
  readonly email?: string;
  readonly phone?: string;
  readonly name?: string;
}
