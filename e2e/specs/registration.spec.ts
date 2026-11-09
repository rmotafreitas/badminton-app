import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { PEOPLE } from "../support/env";
import { shot, signIn } from "../support/helpers";

test("a member fills in their details and downloads the registration form; the club admin records and approves it", async ({ page, browser }) => {
  await signIn(page, PEOPLE.bruno.email);
  await page.getByRole("link", { name: "Registration" }).click();
  await expect(page.getByRole("heading", { name: "Club registration" })).toBeVisible();
  await expect(page.getByText("Not started yet")).toBeVisible();

  // Details: typed once, kept for next season.
  await page.getByRole("button", { name: "Edit details" }).click();
  const details = page.getByRole("dialog", { name: "Your details" });
  await details.getByRole("button", { name: "M", exact: true }).click();
  await details.getByLabel("Date of birth").first().fill("1999-05-20");
  await details.getByLabel("Nationality").first().fill("Portuguesa");
  await details.getByLabel("Address").first().fill("Rua das Flores 10");
  await details.getByLabel("Postal code").first().fill("4405663");
  await expect(details.getByLabel("Postal code").first()).toHaveValue("4405-663");
  await details.getByLabel("Locality").first().fill("Gaia");
  await details.getByLabel("Tax number (NIF)").first().fill("123456789");
  await shot(page, "registration-details");
  await details.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();
  await expect(page.getByText("123456789")).toBeVisible();

  await page.getByRole("button", { name: "Training" }).click();
  await page.getByRole("button", { name: "Member", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download form (PDF)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Ficha de inscricao 2024 - Bruno Costa\.pdf$/);
  expect(readFileSync(await file.path()).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.getByText("Waiting for your signed form")).toBeVisible();
  await shot(page, "registration");

  // The club admin's side, in another browser.
  const other = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: test.info().project.use.baseURL });
  const admin = await other.newPage();
  await signIn(admin, PEOPLE.clara.email);
  await admin.getByRole("link", { name: "Registrations" }).click();
  const row = admin.getByRole("button", { name: new RegExp(PEOPLE.bruno.name) });
  await expect(row).toContainText("Waiting");
  await expect(row).toContainText("Training · Member");
  await shot(admin, "club-registrations");
  await row.click();
  const sheet = admin.getByRole("dialog", { name: PEOPLE.bruno.name });
  await expect(sheet.getByRole("switch", { name: "Approved" })).toBeDisabled();
  // Production has no bucket yet: then the checkbox alone is the record. Locally (SeaweedFS) the scan uploads too.
  if (await sheet.getByRole("button", { name: "Upload scan or photo" }).isVisible()) {
    await sheet.locator('input[type="file"]').setInputFiles(".fixtures/avatar.png");
    await expect(admin.getByText("Scan saved.")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Open" })).toBeVisible();
    await expect(sheet.getByRole("switch", { name: "Signed form received" })).toBeChecked();
  } else {
    await expect(sheet.getByText("File uploads aren't set up yet")).toBeVisible();
    await sheet.getByRole("switch", { name: "Signed form received" }).click();
  }
  await expect(sheet.getByRole("switch", { name: "Approved" })).toBeEnabled();
  await sheet.getByRole("switch", { name: "Approved" }).click();
  await expect(sheet.getByRole("switch", { name: "Approved" })).toBeChecked();
  await shot(admin, "club-registration-member");
  await admin.keyboard.press("Escape");
  await expect(row).toContainText("Approved");
  await other.close();

  await page.reload();
  await expect(page.getByText(/Approved on/)).toBeVisible();
});

test("the club admin edits the form text; coaches don't see registrations", async ({ page }) => {
  await signIn(page, PEOPLE.clara.email);
  await page.getByRole("link", { name: "Registrations" }).click();
  await page.getByRole("button", { name: "Form settings" }).click();
  const settings = page.getByRole("dialog", { name: "Form settings" });
  await expect(settings.getByLabel("Season")).toHaveValue("2024");
  await settings.getByLabel("Annual fee (€)").fill("20");
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Form saved.").last()).toBeVisible();
  // Put it back for the other tests.
  await page.getByRole("button", { name: "Form settings" }).click();
  await page.getByRole("dialog", { name: "Form settings" }).getByLabel("Annual fee (€)").fill("15");
  await page.getByRole("dialog", { name: "Form settings" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog", { name: "Form settings" })).toBeHidden();
});

test("coaches have no registrations admin", async ({ page }) => {
  await signIn(page, PEOPLE.coach.email);
  await expect(page.getByRole("link", { name: "Registrations" })).toHaveCount(0);
  await page.goto("/club-registrations");
  await expect(page.getByText("Page not found")).toBeVisible();
});
