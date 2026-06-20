import nodemailer from "nodemailer";
import type {
  IMessageChannel,
  MessagePayload,
} from "@/application/interfaces/IMessageChannel";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromAddress: string;
  fromName?: string;
}

export class SmtpEmailChannel implements IMessageChannel {
  readonly channelType = "email" as const;

  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.fromName
      ? `${config.fromName} <${config.fromAddress}>`
      : config.fromAddress;

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password,
      },
      // Needed for Gmail's STARTTLS on port 587
      requireTLS: !config.secure,
    });
  }

  async send(payload: MessagePayload): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: payload.to,
      subject: payload.subject ?? "(no subject)",
      text: payload.text,
      html: payload.html,
    });
  }
}
