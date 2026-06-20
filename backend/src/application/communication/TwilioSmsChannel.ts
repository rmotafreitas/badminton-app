import twilio from "twilio";
import type {
  IMessageChannel,
  MessagePayload,
} from "@/application/interfaces/IMessageChannel";

export class TwilioSmsChannel implements IMessageChannel {
  readonly channelType = "sms" as const;

  private readonly client: ReturnType<typeof twilio>;

  constructor(
    accountSid: string,
    authToken: string,
    private readonly fromNumber: string,
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async send(payload: MessagePayload): Promise<void> {
    await this.client.messages.create({
      from: this.fromNumber,
      to: payload.to,
      body: payload.text,
    });
  }
}
