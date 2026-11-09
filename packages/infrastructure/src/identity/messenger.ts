import type { Logger, SignInMessenger } from "@bb/application";
import nodemailer from "nodemailer";

export interface MessengerSettings {
  readonly smtp?: { host: string; port: number; secure: boolean; username?: string; password?: string; from: string; fromName: string };
  readonly twilio?: { accountSid: string; authToken: string; fromNumber: string };
  /** Without SMTP/Twilio in development, links and codes are logged instead of sent. Never in production. */
  readonly logInsteadOfSend: boolean;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const layout = (body: string) => `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f1a14">
  <p style="font-weight:700;font-size:18px;color:#15803d;margin:0 0 16px">Badminton Buddy</p>
  ${body}
  <p style="color:#6b7280;font-size:12px;margin-top:32px">If you didn't ask for this, you can ignore this email.</p>
</div>`;

export function createMessenger(settings: MessengerSettings, log: Logger): SignInMessenger {
  const mailer = settings.smtp
    ? nodemailer.createTransport({
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: settings.smtp.secure,
        // STARTTLS is required whenever we send credentials (Gmail and co.); a local catcher (Mailpit) has neither.
        requireTLS: !settings.smtp.secure && !!settings.smtp.username,
        auth: settings.smtp.username ? { user: settings.smtp.username, pass: settings.smtp.password } : undefined,
      })
    : null;
  const from = settings.smtp ? `${settings.smtp.fromName} <${settings.smtp.from}>` : "";

  async function email(to: string, subject: string, text: string, html: string) {
    if (mailer) {
      await mailer.sendMail({ from, to, subject, text, html });
      return;
    }
    if (!settings.logInsteadOfSend) throw new Error("Email is not configured (SMTP_* variables).");
    log.warn("email not sent (no SMTP in development)", { to, subject, text });
  }

  return {
    sendMagicLink: (to, link) =>
      email(
        to,
        "Your sign-in link",
        `Sign in: ${link}\n\nThis link expires in 15 minutes.`,
        layout(`<p>Tap the button to sign in. It expires in <strong>15 minutes</strong>.</p>
          <p style="margin:24px 0"><a href="${escape(link)}" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a></p>`),
      ),
    sendEmailCode: (to, code) =>
      email(
        to,
        `${code} is your Badminton Buddy code`,
        `Your code is ${code}. It expires in 10 minutes. Don't share it.`,
        layout(`<p>Your sign-in code:</p>
          <p style="margin:24px 0;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center">${escape(code)}</p>
          <p style="color:#6b7280;font-size:13px">It expires in <strong>10 minutes</strong>. Don't share it.</p>`),
      ),
    async sendSmsCode(to, code) {
      const body = `${code} is your Badminton Buddy code. It expires in 10 minutes. Don't share it.`;
      if (settings.twilio) {
        await sendTwilioSms(settings.twilio, to, body);
        return;
      }
      if (!settings.logInsteadOfSend) throw new Error("SMS is not configured (TWILIO_* variables).");
      log.warn("sms not sent (no Twilio in development)", { to, body });
    },
  };
}

/**
 * One call to Twilio's Messages API. The official SDK is 19 MB and ~100 ms of cold-start import for this one request,
 * so the API talks REST directly (https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource).
 */
async function sendTwilioSms(account: NonNullable<MessengerSettings["twilio"]>, to: string, body: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account.accountSid)}/Messages.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${account.accountSid}:${account.authToken}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: account.fromNumber, Body: body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { code?: number; message?: string } | null;
    throw new Error(`Twilio refused the SMS (${response.status}${detail?.code ? `, code ${detail.code}` : ""}): ${detail?.message ?? "no details"}`);
  }
}
