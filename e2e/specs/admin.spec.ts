import { expect, test } from "@playwright/test";
import { E2E, PEOPLE } from "../support/env";
import { shot, signIn } from "../support/helpers";

test("a system admin creates a club, assigns someone, and deletes it again", async ({ page }) => {
  await signIn(page, PEOPLE.admin.email);
  await page.getByRole("link", { name: "All clubs" }).click();
  await page.getByRole("button", { name: "New club" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a club" });
  await dialog.getByLabel("Name").fill("Smash Lisboa");
  await dialog.getByLabel("Location").fill("Lisboa");
  await dialog.locator('input[type="file"]').nth(1).setInputFiles(".fixtures/avatar.png");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Club saved.")).toBeVisible();
  await expect(page.getByText("Smash Lisboa")).toBeVisible();
  await shot(page, "clubs");

  await page.getByRole("link", { name: "Members" }).first().click();
  await page.getByRole("combobox").filter({ hasText: "User" }).click();
  await page.getByRole("option", { name: PEOPLE.admin.name }).click();
  await page.getByRole("combobox").filter({ hasText: "Club" }).click();
  await page.getByRole("option", { name: "Smash Lisboa" }).click();
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("Member added.")).toBeVisible();
  await page.getByRole("tab", { name: "All users" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`${PEOPLE.admin.name}.*Smash Lisboa`) })).toBeVisible();
  await shot(page, "members-admin");

  await page.getByRole("link", { name: "All clubs" }).click();
  await page.getByRole("button", { name: "Delete" }).last().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Club deleted.")).toBeVisible();
  await expect(page.getByText("Smash Lisboa")).toHaveCount(0);
});

test("a club with games can't be deleted", async ({ page }) => {
  await signIn(page, PEOPLE.admin.email);
  // Make sure the club has a game, whatever ran before (same-origin call with the admin's session cookie).
  const api = (path: string, init?: { method?: string; data?: unknown }) =>
    page.request.fetch(`${E2E.webUrl}/api${path}`, { ...init, headers: { origin: E2E.webUrl, "content-type": "application/json" } });
  const clubs = (await (await api("/clubs")).json()) as { id: string; name: string }[];
  const club = clubs.find((c) => c.name === "Clube E2E")!;
  const { members } = (await (await api(`/clubs/${club.id}`)).json()) as { members: { id: string }[] };
  const created = await api("/games", {
    method: "POST",
    data: { clubId: club.id, type: "SINGLES", team1PlayerIds: [members[0]!.id], team2PlayerIds: [members[1]!.id], team1Points: 21, team2Points: 9 },
  });
  expect(created.status()).toBe(200);
  await page.goto("/clubs");
  const card = page.locator("[data-slot='card']").filter({ hasText: "Clube E2E" });
  await card.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("This club has recorded games, so it can't be deleted.")).toBeVisible();
});

test("the clubs admin doesn't exist for anyone else", async ({ page }) => {
  await signIn(page, PEOPLE.coach.email);
  await expect(page.getByRole("link", { name: "All clubs" })).toHaveCount(0);
  await page.goto("/clubs");
  await expect(page.getByText("Page not found")).toBeVisible();
});
