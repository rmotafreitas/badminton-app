import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type {
  AuthUserInfo,
  AuthInitResult,
  AuthProvider as AuthProviderType,
} from "@/core/domain/auth";
import { useAuthService } from "@/di/container";

export interface AuthContextType {
  user: AuthUserInfo | null;
  loading: boolean;
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
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const authService = useAuthService();
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const openLoginModal = useCallback(() => setLoginModalOpen(true), []);
  const closeLoginModal = useCallback(() => setLoginModalOpen(false), []);

  const refreshUser = useCallback(async () => {
    const currentUser = await authService.getCurrentUser();
    setUser(currentUser);
  }, [authService]);

  // Check existing session on mount (validates the httpOnly cookie via /auth/me)
  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
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
    },
    [authService],
  );

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, [authService]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: user !== null,
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
