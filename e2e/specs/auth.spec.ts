import { expect, test } from "@playwright/test";
import { E2E, PEOPLE } from "../support/env";
import { latestEmail, shot, signIn } from "../support/helpers";

test.describe("authentication", () => {
  test("a guarded page sends you to sign in, then back where you were", async ({ page }) => {
    await page.goto("/training-review");
    await expect(page).toHaveURL(/\/login\?redirect=%2Ftraining-review/);
    await shot(page, "login");
    await page.getByRole("tab", { name: "Password" }).click();
    await page.locator("#signin-identifier").fill(PEOPLE.ana.email);
    await page.locator("#signin-password").fill(E2E.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/training-review$/);
    await expect(page.getByRole("heading", { name: "Training", exact: true })).toBeVisible();
  });

  test("a wrong password says so, without revealing whether the account exists", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: "Password" }).click();
    await page.locator("#signin-identifier").fill(PEOPLE.ana.email);
    await page.locator("#signin-password").fill("nope");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Wrong email/phone or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("email code: the code arrives by email and signs you in", async ({ page, request }) => {
    await page.goto("/login");
    await page.locator("#signin-email").fill(PEOPLE.bruno.email);
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByText(`Enter the 6-digit code we sent to ${PEOPLE.bruno.email}.`)).toBeVisible();
    const mail = await latestEmail(request, PEOPLE.bruno.email);
    const code = mail.text.match(/\b(\d{6})\b/)?.[1];
    expect(mail.subject).toContain(code);
    await shot(page, "login-code");
    await page.keyboard.type(code!);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Bruno/ })).toBeVisible();
  });

  test("a new email address creates an account (registration open) without a club", async ({ page, request }) => {
    const email = `new-${Date.now()}@e2e.test`;
    await page.goto("/login");
    await page.locator("#signin-email").fill(email);
    await page.getByRole("button", { name: "Send code" }).click();
    const code = (await latestEmail(request, email)).text.match(/\b(\d{6})\b/)?.[1];
    await page.keyboard.type(code!);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("You're not in a club yet")).toBeVisible();
  });

  test("the session survives a reload, and sign-out ends it everywhere in the app", async ({ page }) => {
    await signIn(page, PEOPLE.ana.email);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.getByRole("button", { name: /Ana Silva/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/games");
    await expect(page).toHaveURL(/\/login\?redirect=/);
    // Nothing of Ana's is left on the device.
    expect(await page.evaluate(() => localStorage.getItem("bb:session-snapshot:v1"))).toBeNull();
  });

  test("the session cookie is HttpOnly and host-only", async ({ page, context }) => {
    await signIn(page, PEOPLE.ana.email);
    const cookie = (await context.cookies()).find((c) => c.name === "__Host-bb_session");
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    expect(await page.evaluate(() => document.cookie)).not.toContain("bb_session");
  });
});
