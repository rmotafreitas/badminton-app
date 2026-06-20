import type { AuthInitView } from "@/application/views/auth.view";
import type {
  IAuthProvider,
  AuthIdentity,
} from "@/application/interfaces/IAuthProvider";
import type { IUserRepo } from "@/domain/repositories/IUserRepo";

export class PasswordAuthProvider implements IAuthProvider {
  readonly providerType = "password";

  constructor(private readonly userRepo: IUserRepo) {}

  async initiate(_input: Record<string, string>): Promise<AuthInitView> {
    return { type: "code-sent", message: "Ready to accept credentials" };
  }

  async complete(input: Record<string, string>): Promise<AuthIdentity> {
    const { email, phone, username, password } = input;

    if (!password) throw new Error("Password is required");

    const cleanEmail = (email || username || "").toLowerCase().trim();
    const cleanPhone = (phone || "").trim();

    if (!cleanEmail && !cleanPhone) {
      throw new Error("Email or phone is required");
    }

    const user = cleanEmail
      ? await this.userRepo.findByEmail(cleanEmail)
      : await this.userRepo.findByPhone(cleanPhone);

    if (!user) throw new Error("Invalid credentials");
    if (!user.passwordHash) throw new Error("No password set for this account");

    const isValid = await Bun.password.verify(password, user.passwordHash);
    if (!isValid) throw new Error("Invalid credentials");

    return {
      providerId: cleanEmail || cleanPhone,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
    };
  }

  static async hashPassword(password: string): Promise<string> {
    return Bun.password.hash(password);
  }
}
