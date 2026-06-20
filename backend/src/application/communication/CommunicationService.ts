import type {
  IMessageChannel,
  ChannelType,
  MessagePayload,
} from "@/application/interfaces/IMessageChannel";
import type { ICommunicationService } from "@/application/interfaces/ICommunicationService";

/**
 * Dispatches messages to the correct channel adapter by channelType.
 * Constructor receives all registered channel adapters.
 * Adding a new channel: instantiate it and pass it to the constructor — nothing else changes.
 */
export class CommunicationService implements ICommunicationService {
  private readonly channels: Map<ChannelType, IMessageChannel>;

  constructor(channels: IMessageChannel[]) {
    this.channels = new Map(channels.map((c) => [c.channelType, c]));
  }

  async send(channel: ChannelType, payload: MessagePayload): Promise<void> {
    const adapter = this.channels.get(channel);
    if (!adapter) {
      throw new Error(`No channel registered for type: "${channel}"`);
    }
    await adapter.send(payload);
  }

  async sendMagicLink(
    to: string,
    token: string,
    appUrl: string,
  ): Promise<void> {
    const link = `${appUrl}/auth/callback?token=${encodeURIComponent(token)}&provider=email`;
    await this.send("email", {
      to,
      subject: "Your sign-in link",
      text: `Sign in here: ${link}\n\nThis link expires in 15 minutes.`,
      html: `
        <p>Click the link below to sign in. It expires in <strong>15 minutes</strong>.</p>
        <p style="margin:24px 0">
          <a href="${link}"
             style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">
            Sign in
          </a>
        </p>
        <p style="color:#9ca3af;font-size:12px">
          If you did not request this email you can safely ignore it.
        </p>
      `,
    });
  }

  async sendOtp(to: string, code: string): Promise<void> {
    await this.send("sms", {
      to,
      text: `Your verification code is: ${code}\n\nExpires in 10 minutes. Do not share it.`,
    });
  }

  async sendEmailCode(to: string, code: string): Promise<void> {
    await this.send("email", {
      to,
      subject: "Your verification code",
      text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
      html: `
        <p>Your verification code is:</p>
        <p style="margin:24px 0;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center">
          ${code}
        </p>
        <p style="color:#6b7280;font-size:13px">This code expires in <strong>10 minutes</strong>. Do not share it.</p>
        <p style="color:#9ca3af;font-size:12px">
          If you did not request this code you can safely ignore this email.
        </p>
      `,
    });
  }
}
