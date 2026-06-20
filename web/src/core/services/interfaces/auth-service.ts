import type {
  AuthUserInfo,
  AuthInitResult,
  AuthProvider,
} from "@/core/domain/auth";

export interface AuthService {
  initiateAuth(
    provider: AuthProvider,
    input: Record<string, string>,
  ): Promise<AuthInitResult>;

  completeAuth(
    provider: AuthProvider,
    input: Record<string, string>,
  ): Promise<AuthUserInfo>;

  logout(): Promise<void>;

  getCurrentUser(): Promise<AuthUserInfo | null>;

  isAuthenticated(): Promise<boolean>;
}
