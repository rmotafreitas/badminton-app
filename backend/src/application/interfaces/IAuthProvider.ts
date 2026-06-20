import type { AuthInitView } from "@/application/views/auth.view";

export interface AuthIdentity {
  providerId: string;
  email?: string;
  phone?: string;
  name?: string;
}

/**
 * Adapter interface — every auth provider (Google, Email magic link,
 * Phone SMS, future: Twitter, Discord …) must implement this.
 */
export interface IAuthProvider {
  /** Stable string key, e.g. "google" | "email" | "phone" */
  readonly providerType: string;

  /**
   * Step 1 — start the auth flow.
   * For OAuth providers: returns a redirect URL.
   * For magic-link/OTP providers: sends the link/code and returns a confirmation.
   */
  initiate(input: Record<string, string>): Promise<AuthInitView>;

  /**
   * Step 2 — complete the auth flow and return a verified identity.
   * For OAuth: exchange code / verify ID token.
   * For magic-link/OTP: validate token/code.
   */
  complete(input: Record<string, string>): Promise<AuthIdentity>;
}
