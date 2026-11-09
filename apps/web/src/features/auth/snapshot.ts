import type { SessionUser } from "@bb/contracts";

/**
 * The last known signed-in user, in localStorage. Lets a cold start render the app at once (no login flash while the
 * API wakes up) and keep working offline. It holds no token — the session cookie is HttpOnly — so it grants
 * nothing: the API remains the only authority, and the session query revalidates it in the background.
 */
const KEY = "bb:session-snapshot:v1";

export const sessionSnapshot = {
  read(): SessionUser | null {
    try {
      const raw = localStorage.getItem(KEY);
      const user = raw ? (JSON.parse(raw) as SessionUser) : null;
      return user && typeof user.id === "string" && Array.isArray(user.roles) ? user : null;
    } catch {
      return null;
    }
  },
  save(user: SessionUser): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(user));
    } catch {
      // private mode / quota: the app still works, just without the instant start
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY);
      // The old app's keys: user snapshot and hand-written query cache.
      for (const k of Object.keys(localStorage)) if (k.startsWith("badminton-auth") || k.startsWith("qc:")) localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};
