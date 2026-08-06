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

export type AuthPhase = "restoring" | "authenticated" | "unauthenticated";

const AUTH_USER_STORAGE_KEY = "badminton-auth-user";
const AUTH_QUERY_KEY = ["auth", "me"] as const;

function readPersistedUser(): AuthUserInfo | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUserInfo;
    if (!parsed?.userId || !Array.isArray(parsed.roles)) return null;
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
  isReconnecting: boolean;
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

const RECONNECT_BACKOFF = [1000, 2000, 4000, 8000] as const;
const RECONNECT_MAX_ATTEMPTS = RECONNECT_BACKOFF.length;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const authService = useAuthService();
  const [user, setUser] = useState<AuthUserInfo | null>(() => readPersistedUser());
  const [authPhase, setAuthPhase] = useState<AuthPhase>(() =>
    readPersistedUser() ? "authenticated" : "restoring",
  );
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const didInitRef = useRef(false);
  const reconnectRef = useRef(0);

  const openLoginModal = useCallback(() => setLoginModalOpen(true), []);
  const closeLoginModal = useCallback(() => setLoginModalOpen(false), []);

  const refreshUser = useCallback(async (): Promise<AuthUserInfo | null> => {
    try {
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        persistUser(currentUser);
        queryCache.set(AUTH_QUERY_KEY, currentUser, { persist: false });
        setAuthPhase("authenticated");
        setIsReconnecting(false);
        reconnectRef.current = 0;
        return currentUser;
      }
      // getCurrentUser returned null — this means a 401 that the interceptor
      // couldn't refresh (both tokens dead). Don't retry — user needs login.
      setUser(null);
      persistUser(null);
      queryCache.remove(AUTH_QUERY_KEY);
      setAuthPhase("unauthenticated");
      setIsReconnecting(false);
      return null;
    } catch {
      // Network / timeout error — backend may be asleep.
      // If we have an optimistic cached session, keep it and retry with backoff.
      const hasCachedUser = readPersistedUser() !== null;
      if (hasCachedUser) {
        if (reconnectRef.current < RECONNECT_MAX_ATTEMPTS) {
          setIsReconnecting(true);
          const delay = RECONNECT_BACKOFF[reconnectRef.current]!;
          reconnectRef.current += 1;
          await new Promise((r) => setTimeout(r, delay));
          return refreshUser();
        }
        // All retries exhausted — keep optimistic session but stop reconnecting spinner.
        setIsReconnecting(false);
        reconnectRef.current = 0;
        setAuthPhase("authenticated");
        return readPersistedUser();
      }
      // No cached session and can't reach the server — mark unauthenticated.
      setIsReconnecting(false);
      setAuthPhase("unauthenticated");
      return null;
    }
  }, [authService]);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    refreshUser();
  }, [refreshUser]);

  const initiateAuth = useCallback(
    (provider: AuthProviderType, input: Record<string, string>) =>
      authService.initiateAuth(provider, input),
    [authService],
  );

  const completeAuth = useCallback(
    async (provider: AuthProviderType, input: Record<string, string>) => {
      const userInfo = await authService.completeAuth(provider, input);
      // Clear stale error entries so useQuery hooks refetch with fresh auth.
      queryCache.clear();
      queryCache.set(AUTH_QUERY_KEY, userInfo, { persist: false });
      setUser(userInfo);
      persistUser(userInfo);
      setAuthPhase("authenticated");
      setIsReconnecting(false);
    },
    [authService],
  );

  const logout = useCallback(async () => {
    // Clear local state IMMEDIATELY — don't wait for the server.
    // The server cookie-clear is best-effort (fire-and-forget).
    queryCache.clear();
    setUser(null);
    persistUser(null);
    setAuthPhase("unauthenticated");
    setIsReconnecting(false);
    // Fire the server logout in the background; ignore failures.
    authService.logout().catch(() => {});
  }, [authService]);

  const loading = authPhase === "restoring";

  const value = useMemo(
    () => ({
      user,
      loading,
      authPhase,
      isAuthenticated: authPhase === "authenticated" && user !== null,
      isReconnecting,
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
      isReconnecting,
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
