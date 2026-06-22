import { describe, it, expect } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { createApp } from "../../src/app";
import { createUnauthedApi, createAuthedApi, setupDepsForPasswordTest } from "../helpers";

describe("Auth", () => {
  const api = createUnauthedApi();

  // ── Initiate ────────────────────────────────────────────────────────────
  describe("POST /auth/initiate", () => {
    it("returns redirect for google provider", async () => {
      const { data, status } = await api.auth.initiate.post({
        provider: "google",
        input: {},
      });
      expect(status).toBe(200);
      expect(data!.type).toBe("redirect");
      expect(data!.redirectUrl).toBeString();
    });

    it("returns code-sent for email provider", async () => {
      const { data, status } = await api.auth.initiate.post({
        provider: "email",
        input: { email: "test@example.com" },
      });
      expect(status).toBe(200);
      expect(data!.type).toBe("code-sent");
    });

    it("returns code-sent for email-code provider", async () => {
      const { data, status } = await api.auth.initiate.post({
        provider: "email-code",
        input: { email: "test@example.com" },
      });
      expect(status).toBe(200);
      expect(data!.type).toBe("code-sent");
    });

    it("returns code-sent for phone provider", async () => {
      const { data, status } = await api.auth.initiate.post({
        provider: "phone",
        input: { phone: "+1234567890" },
      });
      expect(status).toBe(200);
      expect(data!.type).toBe("code-sent");
    });

    it("returns confirmation for password provider", async () => {
      const { data, status } = await api.auth.initiate.post({
        provider: "password",
        input: {},
      });
      expect(status).toBe(200);
    });

    it("returns 422 for unknown provider (schema validation)", async () => {
      const { status } = await api.auth.initiate.post({
        provider: "unknown" as any,
        input: {},
      });
      expect(status).toBe(422);
    });
  });

  // ── Complete ────────────────────────────────────────────────────────────
  describe("POST /auth/complete", () => {
    it("completes google auth and returns user with httpOnly cookie", async () => {
      const { data, status, headers } = await api.auth.complete.post({
        provider: "google",
        input: { code: "test-code" },
      });
      expect(status).toBe(200);
      expect(data).toBeObject();
      expect(data!.roles).toContain("PLAYER");
      expect(data!.email).toBe("test@example.com");

      const setCookie = headers.get("set-cookie");
      expect(setCookie).toBeString();
      expect(setCookie!).toInclude("auth_token=");
      expect(setCookie!).toInclude("HttpOnly");
    });

    it("completes email magic link auth", async () => {
      const { data, status } = await api.auth.complete.post({
        provider: "email",
        input: { token: "magic-token" },
      });
      expect(status).toBe(200);
      expect(data!.roles).toContain("PLAYER");
    });

    it("completes phone sms auth", async () => {
      const { data, status } = await api.auth.complete.post({
        provider: "phone",
        input: { code: "123456" },
      });
      expect(status).toBe(200);
      expect(data!.roles).toContain("PLAYER");
    });

    describe("password provider", () => {
      it("logs in with correct email and password", async () => {
        const deps = await setupDepsForPasswordTest();
        const app = createApp(deps);
        const api = treaty(app);

        const { data, status, headers } = await api.auth.complete.post({
          provider: "password",
          input: { email: "pwuser@test.com", password: "correct-password" },
        });
        expect(status).toBe(200);
        expect(data).toBeObject();
      expect(data!.roles).toContain("PLAYER");
        expect(data!.email).toBe("pwuser@test.com");

        const setCookie = headers.get("set-cookie");
        expect(setCookie).toBeString();
        expect(setCookie!).toInclude("auth_token=");
        expect(setCookie!).toInclude("HttpOnly");
      });

      it("rejects wrong password", async () => {
        const deps = await setupDepsForPasswordTest();
        const app = createApp(deps);
        const api = treaty(app);

        const { status } = await api.auth.complete.post({
          provider: "password",
          input: { email: "pwuser@test.com", password: "wrong-password" },
        });
        expect(status).toBe(401);
      });

      it("rejects unknown email", async () => {
        const deps = await setupDepsForPasswordTest();
        const app = createApp(deps);
        const api = treaty(app);

        const { status } = await api.auth.complete.post({
          provider: "password",
          input: { email: "nobody@test.com", password: "anything" },
        });
        expect(status).toBe(401);
      });

      it("rejects user with no password set", async () => {
        // user-1 exists but has no passwordHash (uses other providers)
        const deps = await setupDepsForPasswordTest();
        const app = createApp(deps);
        const api = treaty(app);

        const { status } = await api.auth.complete.post({
          provider: "password",
          input: { email: "user1@test.com", password: "anything" },
        });
        expect(status).toBe(401);
      });

      it("requires a password field", async () => {
        const deps = await setupDepsForPasswordTest();
        const app = createApp(deps);
        const api = treaty(app);

        const { status } = await api.auth.complete.post({
          provider: "password",
          input: { email: "pwuser@test.com" } as any,
        });
        expect(status).toBe(401);
      });

      it("logs in with phone (no spaces) when stored with spaces", async () => {
        // Stored phone is "+351 912 345 678"; login uses the no-spaces form.
        const deps = await setupDepsForPasswordTest();
        const app = createApp(deps);
        const api = treaty(app);

        const { data, status } = await api.auth.complete.post({
          provider: "password",
          input: { phone: "+351912345678", password: "correct-password" },
        });
        expect(status).toBe(200);
        expect(data).toBeObject();
        expect(data!.phone).toBeTruthy();
      });

      it("trims whitespace from the password on login", async () => {
        const deps = await setupDepsForPasswordTest();
        const app = createApp(deps);
        const api = treaty(app);

        const { status } = await api.auth.complete.post({
          provider: "password",
          input: {
            email: "pwuser@test.com",
            password: "  correct-password  ",
          },
        });
        expect(status).toBe(200);
      });
    });
  });

  // ── Me ─────────────────────────────────────────────────────────────────
  describe("GET /auth/me", () => {
    it("returns 401 without cookie", async () => {
      const { status } = await api.auth.me.get();
      expect(status).toBe(401);
    });
  });

  // ── Logout ─────────────────────────────────────────────────────────────
  describe("POST /auth/logout", () => {
    it("returns 204 and clears cookie", async () => {
      const { status, headers } = await api.auth.logout.post();
      expect(status).toBe(204);

      const setCookie = headers.get("set-cookie");
      expect(setCookie).toBeString();
      expect(setCookie!).toInclude("auth_token=;");
    });
  });

  // ── Claims ─────────────────────────────────────────────────────────────
  describe("GET /auth/claims/me", () => {
    it("returns claims for PLAYER", async () => {
      const authed = createAuthedApi(["PLAYER"]);
      const { data, status } = await authed.auth.claims.me.get();
      expect(status).toBe(200);
      expect(data!.sub).toBe("user-1");
      expect(data!.roles).toContain("PLAYER");
    });

    it("returns 401 without auth cookie", async () => {
      const { status } = await api.auth.claims.me.get();
      expect(status).toBe(401);
    });
  });

  describe("GET /auth/admin/claims", () => {
    it("returns admin data for SYSTEM_ADMIN", async () => {
      const authed = createAuthedApi(["SYSTEM_ADMIN"]);
      const { data, status } = await authed.auth.admin.claims.get();
      expect(status).toBe(200);
      expect(data!.secret).toBe("admin-only data");
    });

    it("returns 403 for PLAYER", async () => {
      const authed = createAuthedApi(["PLAYER"]);
      const { status } = await authed.auth.admin.claims.get();
      expect(status).toBe(403);
    });
  });

  describe("GET /auth/club-admin/claims", () => {
    it("returns data for CLUB_ADMIN", async () => {
      const authed = createAuthedApi(["CLUB_ADMIN"]);
      const { data, status } = await authed.auth["club-admin"].claims.get();
      expect(status).toBe(200);
      expect(data!.secret).toBe("club-admin-only data");
    });

    it("returns 403 for PLAYER", async () => {
      const authed = createAuthedApi(["PLAYER"]);
      const { status } = await authed.auth["club-admin"].claims.get();
      expect(status).toBe(403);
    });

    it("returns data for CLUB_ADMIN+PLAYER (multi-role)", async () => {
      const authed = createAuthedApi(["CLUB_ADMIN", "PLAYER"]);
      const { data, status } = await authed.auth["club-admin"].claims.get();
      expect(status).toBe(200);
      expect(data!.secret).toBe("club-admin-only data");
    });
  });

  describe("multi-role access", () => {
    it("CLUB_ADMIN+PLAYER can access player claims", async () => {
      const authed = createAuthedApi(["CLUB_ADMIN", "PLAYER"]);
      const { data, status } = await authed.auth.claims.me.get();
      expect(status).toBe(200);
      expect(data!.sub).toBe("user-1");
      expect(data!.roles).toContain("CLUB_ADMIN");
      expect(data!.roles).toContain("PLAYER");
    });

    it("CLUB_ADMIN+PLAYER cannot access admin claims", async () => {
      const authed = createAuthedApi(["CLUB_ADMIN", "PLAYER"]);
      const { status } = await authed.auth.admin.claims.get();
      expect(status).toBe(403);
    });

    it("SYSTEM_ADMIN can access all claims", async () => {
      const authed = createAuthedApi(["SYSTEM_ADMIN"]);
      const { status: adminStatus } = await authed.auth.admin.claims.get();
      const { status: clubStatus } = await authed.auth["club-admin"].claims.get();
      const { status: meStatus } = await authed.auth.claims.me.get();
      expect(adminStatus).toBe(200);
      expect(clubStatus).toBe(200);
      expect(meStatus).toBe(200);
    });
  });
});
