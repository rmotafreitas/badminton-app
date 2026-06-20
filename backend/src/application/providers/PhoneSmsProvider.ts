import { randomInt } from "crypto";
import type { AuthInitView } from "@/application/views/auth.view";
import type {
  IAuthProvider,
  AuthIdentity,
} from "@/application/interfaces/IAuthProvider";
import type { IMagicTokenRepo } from "@/domain/repositories/IMagicTokenRepo";
import type { ICommunicationService } from "@/application/interfaces/ICommunicationService";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class PhoneSmsProvider implements IAuthProvider {
  readonly providerType = "phone";

  constructor(
    private readonly magicTokenRepo: IMagicTokenRepo,
    private readonly comms: ICommunicationService,
  ) {}

  async initiate(input: Record<string, string>): Promise<AuthInitView> {
    const phone = (input.phone || "").trim();
    if (!phone) throw new Error("Phone number is required");

    const code = String(randomInt(100_000, 999_999)); // 6-digit OTP
    // Composite key so the 6-digit code is scoped to the phone number
    const storedToken = `${phone}:${code}`;
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.magicTokenRepo.create(phone, "phone", storedToken, expiresAt);
    await this.comms.sendOtp(phone, code);

    return {
      type: "code-sent",
      message: "Verification code sent to your phone",
    };
  }

  async complete(input: Record<string, string>): Promise<AuthIdentity> {
    const phone = (input.phone || "").trim();
    const { code } = input;
    if (!phone || !code) throw new Error("Phone and code are required");

    const storedToken = `${phone}:${code}`;
    const record = await this.magicTokenRepo.findByToken(storedToken);

    if (!record) throw new Error("Invalid code");
    if (record.used) throw new Error("Code already used");
    if (record.expiresAt < new Date()) throw new Error("Code has expired");

    await this.magicTokenRepo.markUsed(record.id);

    return { providerId: phone, phone };
  }
}
