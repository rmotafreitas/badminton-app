import { OAuth2Client } from "google-auth-library";
import type { AuthInitView } from "@/application/views/auth.view";
import type {
  IAuthProvider,
  AuthIdentity,
} from "@/application/interfaces/IAuthProvider";

/**
 * Google OAuth adapter.
 * Supports two flows:
 * - ID token (credential): verified locally via google-auth-library
 * - Access token: exchanged for user info via Google's userinfo API
 */
export class GoogleAuthProvider implements IAuthProvider {
  readonly providerType = "google";

  private readonly client: OAuth2Client;

  constructor(private readonly clientId: string) {
    this.client = new OAuth2Client(clientId);
  }

  // Google's credential is generated client-side; initiate is a no-op.
  async initiate(_input: Record<string, string>): Promise<AuthInitView> {
    return { type: "redirect", message: "Use Google OAuth on the client" };
  }

  async complete(input: Record<string, string>): Promise<AuthIdentity> {
    const { credential, accessToken } = input;

    if (accessToken) {
      return this.completeWithAccessToken(accessToken);
    }

    if (credential) {
      return this.completeWithIdToken(credential);
    }

    throw new Error("Missing Google credential or accessToken");
  }

  private async completeWithIdToken(credential: string): Promise<AuthIdentity> {
    const ticket = await this.client.verifyIdToken({
      idToken: credential,
      audience: this.clientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub) throw new Error("Invalid Google token");

    return {
      providerId: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  }

  private async completeWithAccessToken(
    accessToken: string,
  ): Promise<AuthIdentity> {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) throw new Error("Failed to fetch Google user info");

    const data = (await res.json()) as {
      sub?: string;
      email?: string;
      name?: string;
    };

    if (!data.sub) throw new Error("Invalid Google access token");

    return {
      providerId: data.sub,
      email: data.email,
      name: data.name,
    };
  }
}
