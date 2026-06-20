import { randomInt } from "crypto";
import type { AuthInitView } from "@/application/views/auth.view";
import type {
  IAuthProvider,
  AuthIdentity,
} from "@/application/interfaces/IAuthProvider";
import type { IMagicTokenRepo } from "@/domain/repositories/IMagicTokenRepo";
import type { ICommunicationService } from "@/application/interfaces/ICommunicationService";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class EmailCodeProvider implements IAuthProvider {
  readonly providerType = "email-code";

  constructor(
    private readonly magicTokenRepo: IMagicTokenRepo,
    private readonly comms: ICommunicationService,
  ) {}

  async initiate(input: Record<string, string>): Promise<AuthInitView> {
    const email = (input.email || "").toLowerCase().trim();
    if (!email || !this.isValidEmail(email))
      throw new Error("Valid email is required");

    const code = String(randomInt(1000, 9999)); // 4-digit code
    const storedToken = `${email}:${code}`;
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.magicTokenRepo.create(email, "email", storedToken, expiresAt);
    await this.comms.sendEmailCode(email, code);

    return {
      type: "code-sent",
      message: "Verification code sent — check your inbox",
    };
  }

  async complete(input: Record<string, string>): Promise<AuthIdentity> {
    const email = (input.email || "").toLowerCase().trim();
    const { code } = input;
    if (!email || !code) throw new Error("Email and code are required");

    const storedToken = `${email}:${code}`;
    const record = await this.magicTokenRepo.findByToken(storedToken);

    if (!record) throw new Error("Invalid code");
    if (record.used) throw new Error("Code already used");
    if (record.expiresAt < new Date()) throw new Error("Code has expired");

    await this.magicTokenRepo.markUsed(record.id);

    return { providerId: email, email };
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
