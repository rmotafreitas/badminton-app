import type { IAuthService } from "@/application/interfaces/IAuthService";
import type { IAuthProvider } from "@/application/interfaces/IAuthProvider";
import type { IJwtService } from "@/application/interfaces/IJwtService";
import type { IUserRepo } from "@/domain/repositories/IUserRepo";
import type { AuthInitView, AuthUserView } from "@/application/views/auth.view";
import { AuthMapper } from "@/application/mappers/AuthMapper";
import type { AuthProvider } from "@/domain/entities/User";

export class AuthService implements IAuthService {
  private readonly providers: Map<string, IAuthProvider>;

  constructor(
    private readonly userRepo: IUserRepo,
    private readonly jwtService: IJwtService,
    providers: IAuthProvider[],
    private readonly enableRegistration: boolean = true,
  ) {
    this.providers = new Map(providers.map((p) => [p.providerType, p]));
  }

  private getProvider(providerType: string): IAuthProvider {
    const provider = this.providers.get(providerType);
    if (!provider) throw new Error(`Unknown auth provider: ${providerType}`);
    return provider;
  }

  async initiate(
    provider: string,
    input: Record<string, string>,
  ): Promise<AuthInitView> {
    // Fail-fast: if registration is disabled, check that a user exists
    // before sending any SMS / email — don't waste communication resources.
    if (!this.enableRegistration) {
      const email = input.email?.trim().toLowerCase();
      const phone = input.phone?.trim();

      if (email) {
        const existing = await this.userRepo.findByEmail(email);
        if (!existing) {
          throw new Error("No account found. Please contact your administrator to create one.");
        }
      } else if (phone) {
        const existing = await this.userRepo.findByPhone(phone);
        if (!existing) {
          throw new Error("No account found. Please contact your administrator to create one.");
        }
      }
      // google / password providers don't receive email/phone at initiate
      // time — the complete() guard handles those.
    }

    return this.getProvider(provider).initiate(input);
  }

  async complete(
    provider: string,
    input: Record<string, string>,
  ): Promise<{ user: AuthUserView; token: string }> {
    const identity = await this.getProvider(provider).complete(input);

    // Find existing user linked to this provider identity
    let user = await this.userRepo.findByAuthMethod(
      provider as AuthProvider,
      identity.providerId,
    );

    if (!user) {
      // Merge by email / phone to avoid duplicate accounts
      const existing = identity.email
        ? await this.userRepo.findByEmail(identity.email)
        : identity.phone
          ? await this.userRepo.findByPhone(identity.phone)
          : null;

      if (existing) {
        await this.userRepo.linkAuthMethod(
          existing.id,
          provider as AuthProvider,
          identity.providerId,
        );
        user = existing;
      } else {
        if (!this.enableRegistration) {
          throw new Error("No account found. Please contact your administrator to create one.");
        }
        user = await this.userRepo.createUserWithAuthMethod({
          email: identity.email,
          phone: identity.phone,
          name: identity.name,
          provider: provider as AuthProvider,
          providerId: identity.providerId,
        });
      }
    }

    if (!user.isActive) throw new Error("Account is deactivated");

    const token = this.jwtService.sign({ sub: user.id, roles: user.roles });

    return { user: AuthMapper.toView(user), token };
  }

  async validateSession(token: string): Promise<AuthUserView> {
    const payload = this.jwtService.verify(token);

    const user = await this.userRepo.findById(payload.sub);
    if (!user || !user.isActive) throw new Error("User not found or inactive");

    return AuthMapper.toView(user);
  }
}
