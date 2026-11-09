import { expect, test } from "@playwright/test";
import { PEOPLE } from "../support/env";
import { gameForm } from "../support/game-form";
import { shot, signIn } from "../support/helpers";

test("phone: bottom tabs, the big + offers what to do next, the sidebar is a sheet", async ({ page }) => {
  await page.goto("/login");
  await shot(page, "login");
  await signIn(page, PEOPLE.ana.email);
  await shot(page, "dashboard");
  const tabs = page.getByRole("navigation").last();
  await tabs.getByRole("link", { name: "Games" }).click();
  await expect(page).toHaveURL(/\/games/);
  await shot(page, "games");

  // The + is a bottom sheet of actions, all in thumb reach.
  await tabs.getByRole("button", { name: "New game" }).click();
  const actions = page.getByRole("dialog", { name: "What do you want to do?" });
  await expect(actions.getByRole("link", { name: /Keep score/ })).toBeVisible();
  await shot(page, "actions");
  await actions.getByRole("link", { name: /Enter a result/ }).click();
  const dialog = page.getByRole("dialog", { name: "Register a game" });
  await expect(dialog.getByRole("button", { name: "Team 1 1", exact: true })).toContainText(PEOPLE.ana.name);
  // The score is a grid of big numbers, never the keyboard.
  await dialog.getByRole("button", { name: "Team 1 Score", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Team 1 score" }).getByRole("button", { name: "21, most games" })).toBeVisible();
  await shot(page, "score-picker");
  await page.getByRole("dialog", { name: "Team 1 score" }).getByRole("button", { name: "21", exact: true }).click();
  await page.getByRole("dialog", { name: "Team 2 score" }).getByRole("button", { name: "18", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Team 2 Score", exact: true })).toHaveText("18");
  await shot(page, "game-register");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("link", { name: "Training" }).click();
  await expect(page).toHaveURL(/\/training-review/);
  await shot(page, "training");
  await tabs.getByRole("link", { name: "Profile" }).click();
  await shot(page, "profile");
});

test("phone: keep score live — tap a half per rally, undo, then save the game", async ({ page }) => {
  await signIn(page, PEOPLE.ana.email);
  await page.goto("/score");
  // You're already on your side; the opponent is one tap away (or later, when saving).
  await expect(page.getByRole("button", { name: "Your side 1" })).toContainText(PEOPLE.ana.name);
  await page.getByRole("button", { name: "Opponents 1" }).click();
  await page.getByRole("option", { name: new RegExp(PEOPLE.bruno.name) }).click();
  await shot(page, "score-setup");
  await page.getByRole("button", { name: "Start" }).click();

  const ana = page.getByRole("button", { name: "Point for Ana" });
  const bruno = page.getByRole("button", { name: "Point for Bruno" });
  await bruno.click();
  await expect(bruno).toContainText("1");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(bruno).toContainText("0");
  for (let i = 0; i < 20; i++) await ana.click();
  await bruno.click();
  await shot(page, "scoreboard");
  await ana.click();

  // 21–1: game over; save it straight away (the result form is already filled in).
  const over = page.getByRole("alertdialog", { name: "Game over" });
  await expect(over.getByText("21–1")).toBeVisible();
  await shot(page, "game-over");
  await over.getByRole("button", { name: "Save game" }).click();
  const form = page.getByRole("dialog", { name: "Register a game" });
  await expect(form.getByRole("button", { name: "Team 1 Score", exact: true })).toHaveText("21");
  await expect(form.getByRole("button", { name: "Team 2 Score", exact: true })).toHaveText("1");
  await expect(form.getByRole("button", { name: "Team 2 1", exact: true })).toContainText(PEOPLE.bruno.name);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/games\/[a-f0-9]{24}$/);
  await expect(page.getByText("Winner")).toBeVisible();

  // The match is cleared: the next visit starts fresh.
  await page.goto("/score");
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
});

test("phone: the install card explains how to add the app, and 'not now' sticks", async ({ page }) => {
  await signIn(page, PEOPLE.rui.email);
  await expect(page.getByText("Install Badminton Buddy")).toBeVisible();
  // No install prompt in a test browser: the card falls back to the browser-menu steps.
  await page.getByRole("button", { name: "Install", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Add to your home screen" });
  await expect(guide.getByText(/Install app.*Add to Home screen/)).toBeVisible();
  await shot(page, "install-guide");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText("Install Badminton Buddy")).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Install Badminton Buddy")).toBeHidden();
});
