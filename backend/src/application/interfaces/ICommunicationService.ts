import type { ChannelType, MessagePayload } from "./IMessageChannel";

/**
 * Application-level communication service port.
 * Dispatches messages through registered channel adapters.
 */
export interface ICommunicationService {
  send(channel: ChannelType, payload: MessagePayload): Promise<void>;
  sendMagicLink(to: string, token: string, appUrl: string): Promise<void>;
  sendEmailCode(to: string, code: string): Promise<void>;
  sendOtp(to: string, code: string): Promise<void>;
}
