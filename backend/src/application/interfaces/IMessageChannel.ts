/**
 * Channel types supported by the communication module.
 * Extend this union when adding new channels (e.g. "whatsapp" | "push").
 */
export type ChannelType = "email" | "sms";

/**
 * Unified message payload.
 * Channels use only the fields that make sense for them
 * (e.g. SMS ignores `subject` and `html`).
 */
export interface MessagePayload {
  to: string;
  subject?: string;
  text: string;
  html?: string;
}

/**
 * Adapter interface — every communication channel must implement this.
 * Adding a new channel: implement IMessageChannel, register in CommunicationService.
 */
export interface IMessageChannel {
  readonly channelType: ChannelType;
  send(payload: MessagePayload): Promise<void>;
}
