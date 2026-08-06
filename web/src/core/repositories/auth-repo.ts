import api from "@/lib/api";
import { AxiosError } from "axios";
import type { AuthRepo } from "@/core/repositories/interfaces/auth-repo";
import type {
  AuthUserInfo,
  AuthInitResult,
  AuthProvider,
} from "@/core/domain/auth";
import type { AuthUserDTO, AuthInitResultDTO } from "@/core/dtos/auth.dto";
import { AuthMapper } from "@/core/mappers/auth-mapper";

function isNetworkError(err: unknown): boolean {
  if (err instanceof AxiosError) {
    return (
      err.code === "ECONNABORTED" ||
      err.code === "ETIMEDOUT" ||
      err.code === "ERR_NETWORK" ||
      err.message === "Network Error"
    );
  }
  return false;
}

export class AuthRepoImpl implements AuthRepo {
  async initiateAuth(
    provider: AuthProvider,
    input: Record<string, string>,
  ): Promise<AuthInitResult> {
    const { data } = await api.post<AuthInitResultDTO>("/auth/initiate", {
      provider,
      input,
    });
    return AuthMapper.toAuthInitResult(data);
  }

  async completeAuth(
    provider: AuthProvider,
    input: Record<string, string>,
  ): Promise<AuthUserInfo> {
    const { data } = await api.post<AuthUserDTO>("/auth/complete", {
      provider,
      input,
    });
    return AuthMapper.toAuthUserInfo(data);
  }

  async refreshAuth(): Promise<void> {
    await api.post("/auth/refresh");
  }

  async logout(): Promise<void> {
    await api.post("/auth/logout");
  }

  async getCurrentUser(): Promise<AuthUserInfo | null> {
    try {
      const { data } = await api.get<AuthUserDTO>("/auth/me");
      return AuthMapper.toAuthUserInfo(data);
    } catch (err) {
      if (isNetworkError(err)) throw err;
      return null;
    }
  }
}
