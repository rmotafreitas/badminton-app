import { expect, test } from "@playwright/test";
import { PEOPLE } from "../support/env";
import { shot, signIn } from "../support/helpers";

test("dark mode and Portuguese stick across reloads", async ({ page }) => {
  await signIn(page, PEOPLE.ana.email);
  const menu = page.getByRole("button", { name: /Ana Silva/ });
  await menu.click();
  await page.getByRole("menuitem", { name: "Theme" }).hover();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.keyboard.press("Escape");
  await menu.click();
  await page.getByRole("menuitem", { name: "Language" }).hover();
  await page.getByRole("menuitemradio", { name: "Português" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("link", { name: "Painel" }).first()).toBeVisible();
  await shot(page, "dashboard-dark-pt");
  await page.goto("/training-review");
  await shot(page, "training-dark-pt", { fullPage: true });
});

test("unknown pages keep the layout and offer a way back", async ({ page }) => {
  await signIn(page, PEOPLE.ana.email);
  await page.goto("/this/does/not/exist");
  await expect(page.getByText("Page not found")).toBeVisible();
  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("offline: a banner says so and the saved data keeps showing", async ({ page, context }) => {
  await signIn(page, PEOPLE.ana.email);
  await page.getByRole("link", { name: "Members" }).first().click();
  await expect(page.getByRole("link", { name: new RegExp(PEOPLE.rui.name) }).first()).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toBeVisible();
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await page.getByRole("link", { name: "Members" }).first().click();
  await expect(page.getByRole("link", { name: new RegExp(PEOPLE.rui.name) }).first()).toBeVisible();
  await shot(page, "offline");
  await context.setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toBeHidden();
});
