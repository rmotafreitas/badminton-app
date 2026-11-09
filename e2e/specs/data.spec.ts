import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { E2E, PEOPLE } from "../support/env";
import { shot, signIn } from "../support/helpers";

const openDataTable = async (page: Page, name: string) => {
  await page.getByRole("link", { name: "Data" }).click();
  await expect(page).toHaveURL(/\/data$/);
  await page.getByRole("main").getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
};

test("a system admin browses every table: search, filter, sort, details, CSV", async ({ page }) => {
  await signIn(page, PEOPLE.admin.email);
  await page.getByRole("link", { name: "Data" }).click();
  for (const table of ["Clubs", "Members", "Games", "Training reviews", "Sessions", "Sign-in codes", "Rate limits"]) {
    await expect(page.getByRole("main").getByRole("link", { name: new RegExp(table) })).toBeVisible();
  }
  await shot(page, "data-index");

  await page.getByRole("main").getByRole("link", { name: /Members/ }).click();
  await expect(page.getByRole("row", { name: new RegExp(PEOPLE.ana.name) })).toBeVisible();
  await page.getByPlaceholder("Search…").fill("silva");
  await expect(page).toHaveURL(/q=silva/);
  await expect(page.getByRole("row")).toHaveCount(2); // header + Ana
  await page.getByPlaceholder("Search…").fill("");
  await page.getByRole("combobox", { name: "Roles" }).click();
  await page.getByRole("option", { name: "Club admin" }).click();
  await expect(page.getByRole("row", { name: new RegExp(PEOPLE.clara.name) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(PEOPLE.ana.name) })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("button", { name: "Name" }).click();
  await expect(page).toHaveURL(/sort=name/);
  await shot(page, "data-members");

  await page.getByRole("row", { name: new RegExp(PEOPLE.ana.name) }).click();
  const sheet = page.getByRole("dialog", { name: PEOPLE.ana.name });
  await expect(sheet.getByText(PEOPLE.ana.email)).toBeVisible();
  await shot(page, "data-record");
  await sheet.getByRole("button", { name: "Edit" }).click();
  await expect(sheet.getByRole("button", { name: "Admin", exact: true })).toBeVisible(); // system admins may grant it
  await page.keyboard.press("Escape");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  const csv = readFileSync(await (await download).path(), "utf8");
  expect(csv).toContain("Ana Silva");
  expect(csv).not.toContain("passwordHash");
});

test("a club admin edits the club and manages members", async ({ page }) => {
  await signIn(page, PEOPLE.clara.email);
  await page.getByRole("link", { name: "Members" }).first().click();

  // Edit the club: name, picture.
  await page.getByRole("button", { name: "Edit club" }).click();
  const clubDialog = page.getByRole("dialog", { name: "Edit club" });
  await clubDialog.getByLabel("Location").fill("Porto");
  await clubDialog.locator('input[type="file"]').nth(1).setInputFiles(".fixtures/avatar.png");
  await clubDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Club saved.")).toBeVisible();

  // Invite someone new by email: they're on the roster right away.
  await page.getByRole("button", { name: "Add member" }).click();
  const add = page.getByRole("dialog", { name: /Add someone to/ });
  await add.getByLabel("Email").fill("nova@e2e.test");
  await add.getByLabel(/Name/).fill("Nova Pessoa");
  await add.getByRole("button", { name: "Coach" }).click();
  await shot(page, "members-add");
  await add.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText(/Nova Pessoa is in the club/)).toBeVisible();
  const nova = page.getByRole("row", { name: /Nova Pessoa/ });
  await expect(nova).toBeVisible();

  // Make the newcomer a club admin instead of a coach (seeded people keep their roles for the other specs).
  await nova.getByRole("button", { name: "Member actions" }).click();
  await page.getByRole("menuitem", { name: "Change roles" }).click();
  const roles = page.getByRole("dialog", { name: "Roles of Nova Pessoa" });
  await expect(roles.getByRole("button", { name: "Admin", exact: true })).toHaveCount(0); // not for club admins
  await roles.getByRole("button", { name: "Coach" }).click();
  await roles.getByRole("button", { name: "Club admin" }).click();
  await roles.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Roles saved.")).toBeVisible();
  await expect(nova.getByText("Club admin")).toBeVisible();
  await shot(page, "members-club-admin");

  // Remove the invite again.
  await nova.getByRole("button", { name: "Member actions" }).click();
  await page.getByRole("menuitem", { name: "Remove from club" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove from club" }).click();
  await expect(page.getByText(/Nova Pessoa left the club/)).toBeVisible();
  await expect(page.getByRole("row", { name: /Nova Pessoa/ })).toHaveCount(0);

  // The Data area shows only the club's tables, scoped to the club.
  await openDataTable(page, "Members");
  await expect(page.getByText("Your club").first()).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(PEOPLE.admin.name) })).toHaveCount(0);
});

test("game scores are edited with the score grid; players don't get the Data area", async ({ page, browser }) => {
  await signIn(page, PEOPLE.coach.email);
  // A game to edit, whatever ran before (same-origin call with the coach's session cookie).
  const api = (path: string, init?: { method?: string; data?: unknown }) =>
    page.request.fetch(`${E2E.webUrl}/api${path}`, { ...init, headers: { origin: E2E.webUrl, "content-type": "application/json" } });
  const { clubId } = ((await (await api("/auth/session")).json()) as { user: { clubId: string } }).user;
  const { members } = (await (await api(`/clubs/${clubId}`)).json()) as { members: { id: string }[] };
  const created = await api("/games", {
    method: "POST",
    data: { clubId, type: "SINGLES", team1PlayerIds: [members[0]!.id], team2PlayerIds: [members[1]!.id], team1Points: 21, team2Points: 9 },
  });
  expect(created.status()).toBe(200);
  await openDataTable(page, "Games");
  const first = page.getByRole("row").nth(1);
  await expect(first).toBeVisible();
  await first.click();
  const sheet = page.getByRole("dialog").first();
  await sheet.getByRole("button", { name: "Edit" }).click();
  await sheet.getByRole("button", { name: "Set 1, Team 2" }).click();
  await page.getByRole("dialog", { name: "Set 1 · Team 2" }).getByRole("button", { name: "17", exact: true }).click();
  await shot(page, "data-game-edit");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(sheet.getByText(/–17/)).toBeVisible();

  const other = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: test.info().project.use.baseURL });
  const asAna = await other.newPage();
  await signIn(asAna, PEOPLE.ana.email);
  await expect(asAna.getByRole("link", { name: "Data" })).toHaveCount(0);
  await asAna.goto("/data");
  await expect(asAna.getByText("Page not found")).toBeVisible();
  await other.close();
});
