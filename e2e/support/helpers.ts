import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { E2E } from "./env";

/** Signs in through the real form (password tab). */
export async function signIn(page: Page, email: string, password = E2E.password) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Password" }).click();
  await page.locator("#signin-identifier").fill(email);
  await page.locator("#signin-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** The newest email Mailpit received for `to`. */
export async function latestEmail(request: APIRequestContext, to: string): Promise<{ subject: string; text: string }> {
  let found: { ID: string; Subject: string } | undefined;
  await expect
    .poll(async () => {
      const res = await request.get(`${E2E.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
      found = (await res.json()).messages?.[0];
      return !!found;
    }, { timeout: 15_000 })
    .toBe(true);
  const message = await (await request.get(`${E2E.mailpitUrl}/api/v1/message/${found!.ID}`)).json();
  return { subject: message.Subject, text: message.Text };
}

/** Saves a screenshot next to the specs (`e2e/screenshots/`), for the release notes and reviews. */
export async function shot(page: Page, name: string, options: { fullPage?: boolean } = {}) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  const project = test.info().project.name;
  await page.screenshot({ path: `screenshots/${project}-${name}.png`, fullPage: options.fullPage ?? false });
}

export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => localStorage.setItem("bb-theme", t), theme);
}
