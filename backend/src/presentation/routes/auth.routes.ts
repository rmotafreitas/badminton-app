import Elysia, { t } from "elysia";
import type { JwtService } from "@/application/jwt/JwtService";
import type { AuthController } from "@/presentation/controllers/AuthController";
import { requireRoles } from "@/presentation/middleware/auth.guard";

const PROVIDERS = t.Union([
  t.Literal("google"),
  t.Literal("email"),
  t.Literal("email-code"),
  t.Literal("phone"),
  t.Literal("password"),
]);

export const authRoutes = (ctrl: AuthController, jwtService: JwtService) =>
  new Elysia({ prefix: "/auth" })

    .post("/initiate", ({ body, set }) => ctrl.initiate(body, set), {
      body: t.Object({
        provider: PROVIDERS,
        input: t.Record(t.String(), t.String()),
      }),
      detail: {
        tags: ["Auth"],
        summary: "Initiate auth flow",
        description:
          "Start a login flow: returns a redirect URL (Google) or sends a magic link / OTP (email / phone).",
      },
    })

    .post(
      "/complete",
      ({ body, set, cookie }) => ctrl.complete(body, set, cookie),
      {
        body: t.Object({
          provider: PROVIDERS,
          input: t.Record(t.String(), t.String()),
        }),
        detail: {
          tags: ["Auth"],
          summary: "Complete auth flow",
          description:
            "Verify the credential / token and issue httpOnly access + refresh cookies.",
        },
      },
    )

    .post("/refresh", ({ set, cookie }) => ctrl.refresh(set, cookie), {
      detail: {
        tags: ["Auth"],
        summary: "Refresh session",
        description:
          "Validate the refresh_token cookie and issue a new access_token cookie.",
      },
    })

    .post("/logout", ({ set, cookie }) => ctrl.logout(set, cookie), {
      detail: {
        tags: ["Auth"],
        summary: "Logout",
        description: "Clear the session cookies.",
      },
    })

    .get("/me", ({ set, cookie }) => ctrl.me(set, cookie), {
      detail: {
        tags: ["Auth"],
        summary: "Get current user",
        description:
          "Validate the session cookie and return the authenticated user.",
        security: [{ cookieAuth: [] }],
      },
    })

    // ── Role-protected example endpoints ─────────────────────────────────────
    // Any authenticated user
    .group("/claims", (app) =>
      app
        .derive(
          requireRoles(
            jwtService,
            "PLAYER",
            "COACH",
            "CLUB_ADMIN",
            "SYSTEM_ADMIN",
          ),
        )
        .get(
          "/me",
          ({ currentUser }) => ({
            sub: currentUser.sub,
            roles: currentUser.roles,
          }),
          {
            detail: {
              tags: ["Claims"],
              summary: "Get JWT claims",
              description:
                "Returns the current user's JWT claims. Any authenticated role.",
              security: [{ cookieAuth: [] }],
            },
          },
        ),
    )

    // SYSTEM_ADMIN only
    .group("/admin", (app) =>
      app.derive(requireRoles(jwtService, "SYSTEM_ADMIN")).get(
        "/claims",
        ({ currentUser }) => ({
          sub: currentUser.sub,
          roles: currentUser.roles,
          secret: "admin-only data",
        }),
        {
          detail: {
            tags: ["Claims"],
            summary: "Admin claims",
            description:
              "Returns claims + admin-only data. Requires SYSTEM_ADMIN role.",
            security: [{ cookieAuth: [] }],
          },
        },
      ),
    )

    // SYSTEM_ADMIN or CLUB_ADMIN
    .group("/club-admin", (app) =>
      app.derive(requireRoles(jwtService, "SYSTEM_ADMIN", "CLUB_ADMIN")).get(
        "/claims",
        ({ currentUser }) => ({
          sub: currentUser.sub,
          roles: currentUser.roles,
          secret: "club-admin-only data",
        }),
        {
          detail: {
            tags: ["Claims"],
            summary: "Club Admin claims",
            description:
              "Returns claims. Requires SYSTEM_ADMIN or CLUB_ADMIN role.",
            security: [{ cookieAuth: [] }],
          },
        },
      ),
    );
