import { randomBytes } from "crypto";
import type { AuthInitView } from "@/application/views/auth.view";
import type {
  IAuthProvider,
  AuthIdentity,
} from "@/application/interfaces/IAuthProvider";
import type { IMagicTokenRepo } from "@/domain/repositories/IMagicTokenRepo";
import type { ICommunicationService } from "@/application/interfaces/ICommunicationService";

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class EmailMagicProvider implements IAuthProvider {
  readonly providerType = "email";

  constructor(
    private readonly magicTokenRepo: IMagicTokenRepo,
    private readonly comms: ICommunicationService,
    private readonly appUrl: string,
  ) {}

  async initiate(input: Record<string, string>): Promise<AuthInitView> {
    const email = (input.email || "").toLowerCase().trim();
    if (!email || !this.isValidEmail(email))
      throw new Error("Valid email is required");

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.magicTokenRepo.create(email, "email", token, expiresAt);
    await this.comms.sendMagicLink(email, token, this.appUrl);

    return { type: "code-sent", message: "Magic link sent — check your inbox" };
  }

  async complete(input: Record<string, string>): Promise<AuthIdentity> {
    const { token } = input;
    if (!token) throw new Error("Token is required");

    const record = await this.magicTokenRepo.findByToken(token);
    if (!record) throw new Error("Invalid or expired link");
    if (record.used) throw new Error("Link already used");
    if (record.expiresAt < new Date()) throw new Error("Link has expired");

    await this.magicTokenRepo.markUsed(record.id);

    return { providerId: record.target, email: record.target };
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
