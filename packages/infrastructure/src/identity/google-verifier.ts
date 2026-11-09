import type { GoogleIdentity, GoogleVerifier } from "@bb/application";
import { Unauthenticated } from "@bb/domain";
import type { OAuth2Client } from "google-auth-library";

const invalid = () => new Unauthenticated("Google sign-in failed. Try again.", "oauth_failed");

export function googleVerifier(clientId: string | undefined): GoogleVerifier {
  if (!clientId) {
    return {
      configured: false,
      verifyIdToken: () => Promise.reject(invalid()),
      verifyAccessToken: () => Promise.reject(invalid()),
    };
  }
  // Loaded on the first Google sign-in, not at cold start. The client caches Google's signing keys while warm.
  let client: Promise<OAuth2Client> | undefined;
  const google = () => (client ??= import("google-auth-library").then(({ OAuth2Client }) => new OAuth2Client(clientId)));
  return {
    configured: true,
    async verifyIdToken(credential): Promise<GoogleIdentity> {
      const ticket = await (await google()).verifyIdToken({ idToken: credential, audience: clientId }).catch(() => {
        throw invalid();
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) throw invalid();
      if (payload.email && payload.email_verified === false) throw invalid();
      return { sub: payload.sub, email: payload.email, name: payload.name };
    },
    /** The popup flow gives an access token: check it was issued to OUR client, then read the profile. */
    async verifyAccessToken(accessToken): Promise<GoogleIdentity> {
      const info = await (await google()).getTokenInfo(accessToken).catch(() => {
        throw invalid();
      });
      if (info.aud !== clientId) throw invalid();
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw invalid();
      const data = (await res.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
      if (!data.sub || data.sub !== info.sub) throw invalid();
      if (data.email && data.email_verified === false) throw invalid();
      return { sub: data.sub, email: data.email, name: data.name };
    },
  };
}
