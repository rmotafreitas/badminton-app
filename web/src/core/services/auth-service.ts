import type { AuthService } from "@/core/services/interfaces/auth-service";
import type { AuthRepo } from "@/core/repositories/interfaces/auth-repo";
import type {
  AuthUserInfo,
  AuthInitResult,
  AuthProvider,
} from "@/core/domain/auth";

export class AuthServiceImpl implements AuthService {
  private readonly authRepo: AuthRepo;

  constructor(authRepo: AuthRepo) {
    this.authRepo = authRepo;
  }

  async initiateAuth(
    provider: AuthProvider,
    input: Record<string, string>,
  ): Promise<AuthInitResult> {
    return this.authRepo.initiateAuth(provider, input);
  }

  async completeAuth(
    provider: AuthProvider,
    input: Record<string, string>,
  ): Promise<AuthUserInfo> {
    return this.authRepo.completeAuth(provider, input);
  }

  async logout(): Promise<void> {
    await this.authRepo.logout();
  }

  async getCurrentUser(): Promise<AuthUserInfo | null> {
    return this.authRepo.getCurrentUser();
  }

  async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }
}
