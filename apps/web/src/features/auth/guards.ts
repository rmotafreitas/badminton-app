import type { Role, SessionUser } from "@bb/contracts";
import { notFound, redirect } from "@tanstack/react-router";
import type { AuthState } from "./session";

/** Same-origin relative paths only: no open redirect through `?redirect=`. */
export function safeRedirect(target: unknown, fallback = "/dashboard"): string {
  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return fallback;
  return target;
}

/**
 * A guard is UX, not a data boundary: every API route enforces authentication and authorization itself.
 */
export function requireUser({ context, location }: { context: { auth: AuthState }; location: { href: string } }): SessionUser {
  if (context.auth.kind !== "signed-in") {
    throw redirect({ to: "/login", search: { redirect: location.href } });
  }
  return context.auth.user;
}

/** Areas a role doesn't have are "not found", so their existence isn't revealed. */
export function requireRole(user: SessionUser, ...roles: Role[]): void {
  if (!user.roles.some((r) => roles.includes(r))) throw notFound();
}

export const hasRole = (user: Pick<SessionUser, "roles"> | null | undefined, ...roles: Role[]): boolean =>
  !!user && user.roles.some((r) => roles.includes(r));

export const isStaff = (user: Pick<SessionUser, "roles"> | null | undefined) => hasRole(user, "SYSTEM_ADMIN", "CLUB_ADMIN", "COACH");
