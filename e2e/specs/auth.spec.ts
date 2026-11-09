import { expect, test } from "@playwright/test";
import { E2E, PEOPLE } from "../support/env";
import { fillSignIn, shot, signIn } from "../support/helpers";

test.describe("authentication", () => {
  test("a guarded page sends you to sign in, then back where you were", async ({ page }) => {
    await page.goto("/training-review");
    await expect(page).toHaveURL(/\/login\?redirect=%2Ftraining-review/);
    await shot(page, "login");
    await fillSignIn(page, PEOPLE.ana.email);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/training-review$/);
    await expect(page.getByRole("heading", { name: "Training", exact: true })).toBeVisible();
  });

  test("a wrong password says so, without revealing whether the account exists", async ({ page }) => {
    await page.goto("/login");
    await fillSignIn(page, PEOPLE.ana.email, "nope");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Wrong email/phone or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("only phone and password: Portugal is preselected, and a number that can't exist is caught first", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Country")).toHaveValue("PT");
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
    await page.locator("#signin-phone").fill("12");
    await page.locator("#signin-password").fill(E2E.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("That doesn't look like a valid number for this country.")).toBeVisible();
    // Typed in full with another country's prefix, the number still wins over the picker.
    await page.getByLabel("Country").selectOption("ES");
    await page.locator("#signin-phone").fill(PEOPLE.ana.phone);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
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
