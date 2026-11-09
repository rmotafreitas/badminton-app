import { expect, test } from "@playwright/test";
import { PEOPLE } from "../support/env";
import { gameForm } from "../support/game-form";
import { shot, signIn } from "../support/helpers";

const singlesRating = (page: import("@playwright/test").Page) =>
  page.getByText("Singles rating").locator("xpath=ancestor::*[@data-slot='card'][1]").locator(".tabular").first();

test("register, review, edit and delete a game — ratings follow every step", async ({ page }) => {
  await signIn(page, PEOPLE.ana.email);
  const start = Number(await singlesRating(page).innerText());

  // Register from the top bar's "New game" menu. A player starts on team 1; nothing is typed.
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("menuitem", { name: /Enter a result/ }).click();
  const dialog = page.getByRole("dialog", { name: "Register a game" });
  const form = gameForm(page, dialog);
  await expect(dialog.getByRole("button", { name: "Team 1 1", exact: true })).toContainText(PEOPLE.ana.name);
  await form.player("Team 2 1", PEOPLE.bruno.name);
  // No "points or sets" question: one row is a points game.
  await form.row("Score", 21, 21);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("A set can't end in a draw.")).toBeVisible();
  await form.score("Team 2 Score", 15);
  await shot(page, "game-register");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Game saved — ratings updated.")).toBeVisible();
  await expect(dialog).toBeHidden();

  // The list and the dashboard update without a reload.
  await expect(page.getByRole("link", { name: /Ana Silva.*Bruno Costa/s }).first()).toBeVisible();
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  // Exact numbers depend on everyone's ratings (other specs play games too): a win raises it.
  await expect.poll(async () => Number(await singlesRating(page).innerText())).toBeGreaterThan(start);
  await shot(page, "dashboard");

  // Detail → edit: Bruno won after all.
  await page.getByRole("link", { name: /Ana Silva.*Bruno Costa/s }).first().click();
  await expect(page.getByText("Winner")).toBeVisible();
  await shot(page, "game-detail");
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit game" });
  await gameForm(page, edit).score("Team 1 Score", 15);
  await gameForm(page, edit).score("Team 2 Score", 21);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect.poll(async () => Number(await singlesRating(page).innerText())).toBeLessThan(start);

  // Delete: the rating replay brings Ana back to where she started.
  await page.goBack();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.getByText("Game deleted.")).toBeVisible();
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(singlesRating(page)).toHaveText(String(start));
});

test("doubles: four distinct players, and a coach can register for the club", async ({ page }) => {
  await signIn(page, PEOPLE.coach.email);
  await page.goto("/games?new=true");
  const dialog = page.getByRole("dialog", { name: "Register a game" });
  await dialog.getByRole("radio", { name: "Doubles" }).click();
  const form = gameForm(page, dialog);
  // This coach also plays, so she starts on team 1; tapping her slot swaps her for someone else.
  await expect(dialog.getByRole("button", { name: "Team 1 1", exact: true })).toContainText(PEOPLE.coach.name);
  await form.player("Team 1 1", PEOPLE.ana.name);
  await form.player("Team 1 2", PEOPLE.bruno.name);
  await form.player("Team 2 1", PEOPLE.rui.name);
  // Someone already picked can't be picked twice.
  await dialog.getByRole("button", { name: "Team 2 2", exact: true }).click();
  await expect(page.getByRole("option", { name: new RegExp(PEOPLE.ana.name) })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("option", { name: new RegExp(PEOPLE.coach.name) }).click();
  // Adding a set turns the score into set 1 of a best-of-three.
  await form.row("Score", 21, 17);
  await dialog.getByRole("button", { name: "Add set" }).click();
  await form.row("Set 2", 19, 21);
  await dialog.getByRole("button", { name: "Add set" }).click();
  await form.row("Set 3", 21, 12);
  await expect(dialog.getByRole("button", { name: "Add set" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Game saved — ratings updated.")).toBeVisible();
  await page.getByRole("tab", { name: "Club games" }).click();
  await expect(page.getByRole("link", { name: /Ana Silva & Bruno Costa/ }).first()).toBeVisible();
  await shot(page, "games", { fullPage: true });
});

test("a game you didn't play is not found", async ({ page }) => {
  await signIn(page, PEOPLE.ana.email);
  await page.goto("/games/0000000000000000000000aa");
  await expect(page.getByText("Page not found")).toBeVisible();
});
