import type { AuthInitView, AuthUserView } from "@/application/views/auth.view";

export interface IAuthService {
  /**
   * Step 1 — start an auth flow.
   * Sends a magic-link / OTP or returns a redirect URL depending on the provider.
   */
  initiate(
    provider: string,
    input: Record<string, string>,
  ): Promise<AuthInitView>;

  /**
   * Step 2 — verify the credential / token and return the user's profile +
   * a signed JWT string ready to be set as a cookie.
   */
  complete(
    provider: string,
    input: Record<string, string>,
  ): Promise<{ user: AuthUserView; token: string }>;

  /**
   * Validate an existing session cookie JWT and return the session owner.
   */
  validateSession(token: string): Promise<AuthUserView>;
}
