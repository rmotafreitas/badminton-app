/** `__Host-` prefix: Secure, Path=/, no Domain, so no subdomain can overwrite it. */
export const SESSION_COOKIE = "__Host-bb_session";
/** The JWT cookies of the previous auth system: cleared whenever we see them. */
export const LEGACY_COOKIES = ["auth_token", "refresh_token"] as const;

const ATTRIBUTES = "Path=/; Secure; HttpOnly; SameSite=Lax";

export function readCookie(header: string | null, name: string): string | undefined {
  return (
    header
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) || undefined
  );
}

export const hasCookie = (header: string | null, name: string): boolean =>
  header?.split(";").some((part) => part.trim().startsWith(`${name}=`)) ?? false;

export function sessionCookie(token: string, expiresAt: Date, now: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  return `${SESSION_COOKIE}=${token}; ${ATTRIBUTES}; Max-Age=${maxAge}`;
}

export const clearedSessionCookie = (): string => `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;

/** Set-Cookie headers that drop the old JWT cookies, if the request still carries them. */
export const clearedLegacyCookies = (header: string | null): string[] =>
  LEGACY_COOKIES.filter((name) => hasCookie(header, name)).map((name) => `${name}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);

/** Elysia's `set.headers["set-cookie"]` takes a string or an array; this appends. */
export function appendSetCookie(set: { headers: Record<string, unknown> }, ...cookies: string[]): void {
  if (cookies.length === 0) return;
  const current = set.headers["set-cookie"];
  const list = Array.isArray(current) ? (current as string[]) : typeof current === "string" ? [current] : [];
  set.headers["set-cookie"] = [...list, ...cookies];
}
