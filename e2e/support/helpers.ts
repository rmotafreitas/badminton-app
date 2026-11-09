import { expect, type Page, test } from "@playwright/test";
import { E2E, PEOPLE } from "./env";

/** The seeded person's Portuguese number without +351, as they'd type it. */
export function nationalPhone(email: string): string {
  const person = Object.values(PEOPLE).find((p) => p.email === email);
  if (!person) throw new Error(`No seeded person with ${email}`);
  return person.phone.replace(/^\+351/, "");
}

/** Fills the login form (Portugal is preselected) without submitting. */
export async function fillSignIn(page: Page, email: string, password: string = E2E.password) {
  await page.locator("#signin-phone").fill(nationalPhone(email));
  await page.locator("#signin-password").fill(password);
}

/** Signs in through the real form: phone number and password. */
export async function signIn(page: Page, email: string, password: string = E2E.password) {
  await page.goto("/login");
  await fillSignIn(page, email, password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Saves a screenshot next to the specs (`e2e/screenshots/`), for the release notes and reviews. */
export async function shot(page: Page, name: string, options: { fullPage?: boolean } = {}) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  const project = test.info().project.name;
  await page.screenshot({ path: `screenshots/${project}-${name}.png`, fullPage: options.fullPage ?? false });
}
