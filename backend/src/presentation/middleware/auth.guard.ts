import Elysia, { type Cookie } from "elysia";
import type { JwtService } from "@/application/jwt/JwtService";
import type { Role } from "@/domain/entities/User";

const AUTH_COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 15 * 60, // 15 minutes (matches access token expiry)
};

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 24 * 60 * 60, // 30 days (matches refresh token expiry)
};

// Backward-compatible alias
const COOKIE_OPTS = AUTH_COOKIE_OPTS;

/** Derive `currentUser` from the auth_token cookie on every protected route. */
export const authGuard = (jwtService: JwtService) =>
  new Elysia({ name: "authGuard" }).derive(({ cookie, set }) => {
    const token = cookie["auth_token"]?.value as string | undefined;
    if (!token) {
      set.status = 401;
      throw new Error("Unauthorized");
    }
    try {
      const payload = jwtService.verify(token, "access");
      return { currentUser: payload };
    } catch {
      set.status = 401;
      throw new Error("Invalid or expired token");
    }
  });

/**
 * Returns a `.derive()` callback that authenticates the request AND enforces
 * role membership in one step. Attach it directly with `.derive(...)`.
 *
 * Usage (single role):
 *   app.derive(requireRoles(jwtService, "ADMIN"))
 *
 * Usage (multiple roles — any one is sufficient):
 *   app.derive(requireRoles(jwtService, "ADMIN", "CREATOR"))
 *
 * After calling `.derive(requireRoles(...))`, every downstream handler
 * receives `currentUser: JwtPayload` in its context.
 */
export const requireRoles =
  (jwtService: JwtService, ...roles: Role[]) =>
  ({
    cookie,
    set,
  }: {
    cookie: Record<string, Cookie<unknown>>;
    set: { status?: number | string };
  }) => {
    const token = cookie["auth_token"]?.value as string | undefined;
    if (!token) {
      set.status = 401;
      throw new Error("Unauthorized");
    }
    let payload;
    try {
      payload = jwtService.verify(token, "access");
    } catch {
      set.status = 401;
      throw new Error("Invalid or expired token");
    }
    const userRoles: string[] = payload.roles ?? [];
    if (!userRoles.some((r) => roles.includes(r as Role))) {
      set.status = 403;
      throw new Error(`Forbidden — required role: ${roles.join(" | ")}`);
    }
    return { currentUser: payload };
  };

export { AUTH_COOKIE_OPTS, REFRESH_COOKIE_OPTS, COOKIE_OPTS };
