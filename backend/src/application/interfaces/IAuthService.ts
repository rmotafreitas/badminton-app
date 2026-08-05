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
   * a signed JWT access token and refresh token ready to be set as cookies.
   */
  complete(
    provider: string,
    input: Record<string, string>,
  ): Promise<{ user: AuthUserView; accessToken: string; refreshToken: string }>;

  /**
   * Validate an existing session cookie JWT and return the session owner.
   */
  validateSession(token: string): Promise<AuthUserView>;

  /**
   * Validate a refresh token and issue a new access token.
   */
  refreshSession(
    refreshToken: string,
  ): Promise<{ user: AuthUserView; accessToken: string; refreshToken: string }>;
}
