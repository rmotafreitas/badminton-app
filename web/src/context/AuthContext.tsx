import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type {
  AuthUserInfo,
  AuthInitResult,
  AuthProvider as AuthProviderType,
} from "@/core/domain/auth";
import { useAuthService } from "@/di/container";
import { queryCache } from "@/lib/query-cache";

/**
 * Auth phases (replaces the old boolean `loading`):
 *   - "restoring"     : no local session yet, probing /auth/me (cookie may still be valid)
 *   - "authenticated" : a session is active (optimistically from cache, or confirmed by backend)
 *   - "unauthenticated": confirmed no session
 *
 * The login page must NEVER render its form while the phase is unresolved,
 * so an authenticated user doesn't see the login screen flash during a cold start.
 */
export type AuthPhase = "restoring" | "authenticated" | "unauthenticated";

const AUTH_USER_STORAGE_KEY = "badminton-auth-user";
const AUTH_QUERY_KEY = ["auth", "me"] as const;

function readPersistedUser(): AuthUserInfo | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUserInfo;
    if (!parsed?.userId || !Array.isArray(parsed.roles)) return null;
    // Migrate legacy single-ELO snapshots
    if (typeof (parsed as any).eloSingles !== "number") {
      (parsed as any).eloSingles = (parsed as any).elo ?? 200;
      (parsed as any).eloDoubles = (parsed as any).elo ?? 200;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistUser(user: AuthUserInfo | null): void {
  try {
    if (user) {
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    }
  } catch {
    /* private mode / quota — ignore */
  }
}

export interface AuthContextType {
  user: AuthUserInfo | null;
  loading: boolean;
  authPhase: AuthPhase;
  isAuthenticated: boolean;
  loginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  initiateAuth: (
    provider: AuthProviderType,
    input: Record<string, string>,
  ) => Promise<AuthInitResult>;
  completeAuth: (
    provider: AuthProviderType,
    input: Record<string, string>,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUserInfo | null>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const authService = useAuthService();
  const [user, setUser] = useState<AuthUserInfo | null>(() => readPersistedUser());
  // Optimistic restore: if we have a cached snapshot, start "authenticated".
  const [authPhase, setAuthPhase] = useState<AuthPhase>(() =>
    readPersistedUser() ? "authenticated" : "restoring",
  );
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const didInitRef = useRef(false);

  const openLoginModal = useCallback(() => setLoginModalOpen(true), []);
  const closeLoginModal = useCallback(() => setLoginModalOpen(false), []);

  /**
   * Revalidate the session against /auth/me. Updates the cache + persisted
   * snapshot. Returns the user or null. Does NOT flip the phase to "restoring".
   */
  const refreshUser = useCallback(async (): Promise<AuthUserInfo | null> => {
    const currentUser = await authService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      persistUser(currentUser);
      queryCache.set(AUTH_QUERY_KEY, currentUser, { persist: false });
      setAuthPhase("authenticated");
    } else {
      setUser(null);
      persistUser(null);
      queryCache.remove(AUTH_QUERY_KEY);
      setAuthPhase("unauthenticated");
    }
    return currentUser;
  }, [authService]);

  // On mount: if we restored optimistically, silently revalidate. Otherwise
  // probe once to see if a cookie-only session exists.
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    refreshUser().catch(() => {
      // Network/cold-start failure: keep the optimistic snapshot if present,
      // otherwise mark unauthenticated so the app is usable offline-ish.
      setAuthPhase((prev) =>
        prev === "restoring" ? "unauthenticated" : prev,
      );
    });
  }, [refreshUser]);

  const initiateAuth = useCallback(
    (provider: AuthProviderType, input: Record<string, string>) =>
      authService.initiateAuth(provider, input),
    [authService],
  );

  const completeAuth = useCallback(
    async (provider: AuthProviderType, input: Record<string, string>) => {
      const userInfo = await authService.completeAuth(provider, input);
      setUser(userInfo);
      persistUser(userInfo);
      queryCache.set(AUTH_QUERY_KEY, userInfo, { persist: false });
      setAuthPhase("authenticated");
    },
    [authService],
  );

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    persistUser(null);
    queryCache.remove(AUTH_QUERY_KEY);
    setAuthPhase("unauthenticated");
  }, [authService]);

  const loading = authPhase === "restoring";

  const value = useMemo(
    () => ({
      user,
      loading,
      authPhase,
      isAuthenticated: authPhase === "authenticated" && user !== null,
      loginModalOpen,
      openLoginModal,
      closeLoginModal,
      initiateAuth,
      completeAuth,
      logout,
      refreshUser,
    }),
    [
      user,
      loading,
      authPhase,
      loginModalOpen,
      openLoginModal,
      closeLoginModal,
      initiateAuth,
      completeAuth,
      logout,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
