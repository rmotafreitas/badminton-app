import { expect, test } from "@playwright/test";
import { PEOPLE } from "../support/env";
import { shot, signIn } from "../support/helpers";

test("log, edit and delete a training session", async ({ page }) => {
  await signIn(page, PEOPLE.rui.email);
  await page.getByRole("link", { name: "Training" }).first().click();
  await expect(page.getByText("No training logged yet.")).toBeVisible();
  await shot(page, "training-empty");

  // Effort: one tap on the grid (no slider to drag with a sweaty thumb), a note, save.
  const effort = page.getByRole("radiogroup", { name: "Effort" });
  await effort.getByRole("radio", { name: /^8 · / }).click();
  await expect(page.getByText("/10 · Very hard")).toBeVisible();
  await page.getByLabel(/Notes/).fill("Footwork ladders and 30 min of net kills");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Training saved.")).toBeVisible();
  const history = page.locator("section").filter({ has: page.getByRole("heading", { name: "History" }) });
  await expect(history.getByText("Footwork ladders and 30 min of net kills")).toBeVisible();
  await expect(page.getByText("Sessions").locator("..").getByText("1", { exact: true })).toBeVisible();

  // Yesterday too (one tap), so the calendar and averages have something to show.
  await page.getByRole("button", { name: "Yesterday" }).click();
  await effort.getByRole("radio", { name: /^6 · / }).click();
  await page.getByLabel(/Notes/).fill("Easy rally practice");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(history.getByText("Easy rally practice")).toBeVisible();
  await shot(page, "training", { fullPage: true });

  // Picking a logged day loads it for editing.
  await history.getByRole("button", { name: "8" }).click();
  await expect(page.getByLabel(/Notes/)).toHaveValue("Footwork ladders and 30 min of net kills");
  await page.getByLabel(/Notes/).fill("Footwork ladders, net kills, then smash defence");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(history.getByText("Footwork ladders, net kills, then smash defence")).toBeVisible();
  await expect(history.getByRole("button", { name: "Delete" })).toHaveCount(2);

  // The dashboard's week card counts it.
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page.getByText(/[12] sessions logged/)).toBeVisible();

  await page.goBack();
  await history.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText("Review deleted.")).toBeVisible();
  await expect(history.getByRole("button", { name: "Delete" })).toHaveCount(1);
});
