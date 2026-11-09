import { expect, test } from "@playwright/test";
import { PEOPLE } from "../support/env";
import { shot, signIn } from "../support/helpers";

test("edit your profile with a photo; it appears everywhere and is cached forever", async ({ page }) => {
  await signIn(page, PEOPLE.coach.email);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit profile" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit your profile" });
  await dialog.locator('input[type="file"]').nth(1).setInputFiles(".fixtures/avatar.png");
  await dialog.getByLabel("Bio").fill("Head coach. Loves a good drop shot.");
  await dialog.getByLabel("Name").fill("Carla Coach");
  const imageResponse = page.waitForResponse((r) => /\/api\/media\/profiles\/[a-f0-9]{24}\/photo\//.test(r.url()));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  const image = await imageResponse;
  expect(image.headers()["cache-control"]).toBe("private, max-age=31536000, immutable");
  expect(image.headers()["content-type"]).toBe("image/webp");
  await expect(page.locator("p", { hasText: "Head coach. Loves a good drop shot." })).toBeVisible();
  // The sidebar avatar (session user) updated without a reload.
  await expect(page.locator('[data-sidebar="footer"] img')).toHaveAttribute("src", /\/api\/media\/profiles\//);
  await shot(page, "profile", { fullPage: true });
});

test("contact details: staff of the club see them, other players don't", async ({ page, browser }) => {
  await signIn(page, PEOPLE.coach.email);
  await page.getByRole("link", { name: "Members" }).first().click();
  await expect(page).toHaveURL(/\/users$/);
  await page.getByRole("table").getByRole("link", { name: new RegExp(PEOPLE.ana.name) }).click();
  await expect(page.getByText(PEOPLE.ana.email)).toBeVisible();
  const profileUrl = page.url();

  const other = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: test.info().project.use.baseURL });
  const asBruno = await other.newPage();
  await signIn(asBruno, PEOPLE.bruno.email);
  await asBruno.goto(profileUrl);
  await expect(asBruno.getByRole("heading", { name: PEOPLE.ana.name })).toBeVisible();
  await expect(asBruno.getByText(PEOPLE.ana.email)).toHaveCount(0);
  await asBruno.getByRole("tab", { name: "Head to head" }).click();
  await shot(asBruno, "profile-other");
  await other.close();
});

test("members list: search is accent-insensitive", async ({ page }) => {
  await signIn(page, PEOPLE.ana.email);
  await page.getByRole("link", { name: "Members" }).first().click();
  await page.getByPlaceholder("Search members…").fill("rui santos");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByPlaceholder("Search members…").fill("");
  await shot(page, "members");
});
