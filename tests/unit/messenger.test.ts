import { afterEach, describe, expect, it, mock } from "bun:test";
import { createMessenger } from "@bb/infrastructure";

const log = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as never;
const twilio = { accountSid: "AC123", authToken: "secret", fromNumber: "+15550000000" };
const realFetch = globalThis.fetch;

describe("SMS through Twilio's REST API (no SDK)", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("posts one form-encoded message with basic auth", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json({ sid: "SM1" }, { status: 201 });
    }) as unknown as typeof fetch;

    await createMessenger({ twilio, logInsteadOfSend: false }, log).sendSmsCode("+351912345678", "123456");

    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls as [{ url: string; init: RequestInit }];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(`Basic ${btoa("AC123:secret")}`);
    const form = new URLSearchParams(String(init.body));
    expect(form.get("To")).toBe("+351912345678");
    expect(form.get("From")).toBe("+15550000000");
    expect(form.get("Body")).toContain("123456");
  });

  it("a refusal is an error with Twilio's reason, never a silent success", async () => {
    globalThis.fetch = mock(async () => Response.json({ code: 21211, message: "Invalid 'To' Phone Number" }, { status: 400 })) as unknown as typeof fetch;
    await expect(createMessenger({ twilio, logInsteadOfSend: false }, log).sendSmsCode("+1", "123456")).rejects.toThrow(/400, code 21211.*Invalid 'To'/);
  });
});
