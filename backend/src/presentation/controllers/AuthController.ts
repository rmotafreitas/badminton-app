import type { Cookie } from "elysia";
import type { IAuthService } from "@/application/interfaces/IAuthService";
import type { InitiateAuthDto, CompleteAuthDto } from "@/application/dtos/auth.dto";
import type { AuthInitView, AuthUserView } from "@/application/views/auth.view";
import { COOKIE_OPTS } from "@/presentation/middleware/auth.guard";

export class AuthController {
  constructor(private readonly authService: IAuthService) {}

  async initiate(
    dto: InitiateAuthDto,
    set: { status?: number | string },
  ): Promise<AuthInitView | { error: string }> {
    try {
      return await this.authService.initiate(dto.provider, dto.input);
    } catch (e: unknown) {
      set.status = 400;
      return { error: (e as Error).message };
    }
  }

  async complete(
    dto: CompleteAuthDto,
    set: { status?: number | string },
    cookie: Record<string, Cookie<unknown>>,
  ): Promise<AuthUserView | { error: string }> {
    try {
      const { user, token } = await this.authService.complete(
        dto.provider,
        dto.input,
      );
      cookie["auth_token"].set({ value: token, ...COOKIE_OPTS });
      return user;
    } catch (e: unknown) {
      set.status = 401;
      return { error: (e as Error).message };
    }
  }

  logout(
    set: { status?: number | string },
    cookie: Record<string, Cookie<unknown>>,
  ) {
    cookie["auth_token"].set({ value: "", ...COOKIE_OPTS, maxAge: 0 });
    set.status = 204;
    return null;
  }

  async me(
    set: { status?: number | string },
    cookie: Record<string, Cookie<unknown>>,
  ): Promise<AuthUserView | { error: string }> {
    const token = cookie["auth_token"]?.value as string | undefined;
    if (!token) {
      set.status = 401;
      return { error: "Not authenticated" };
    }
    try {
      return await this.authService.validateSession(token);
    } catch (e: unknown) {
      set.status = 401;
      return { error: (e as Error).message };
    }
  }
}
