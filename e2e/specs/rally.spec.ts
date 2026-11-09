import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { PEOPLE } from "../support/env";
import { shot, signIn } from "../support/helpers";

/**
 * Rally Analysis end to end, on real footage and the real ONNX models (on-device: WebGPU when available, WASM
 * otherwise): import → court check → analysis → stats, overlay and shot review → correction → export to MP4 →
 * the cloud copy. Slow by nature: run with `bun run test:e2e:rally` (RALLY_VIDEO overrides the clip).
 */
const SHORT = resolve(import.meta.dirname, "../.fixtures/rally-short.mp4");
const VIDEO = process.env.RALLY_VIDEO ?? (existsSync(SHORT) ? SHORT : resolve(import.meta.dirname, "../../apps/web/public/lab/sample.mp4"));
const MODELS = resolve(import.meta.dirname, "../../apps/web/public/models/tracknetv3_fp16.onnx");

test.skip(!existsSync(VIDEO) || !existsSync(MODELS), "needs a clip and the models (tools/models/fetch_models.sh)");

test("import a rally video, check the court, analyse it on-device, review and export", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, PEOPLE.coach.email);

  await page.getByRole("link", { name: "Rally analysis" }).first().click();
  await expect(page.getByText("No sessions yet")).toBeVisible();
  await shot(page, "rally-empty");

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import video" }).first().click();
  await (await chooser).setFiles(VIDEO);
  await expect(page).toHaveURL(/\/analysis\/rs-/, { timeout: 30_000 });

  // Court check: the detected court is drawn over a players-removed frame.
  await expect(page.getByText("Is this the court?")).toBeVisible({ timeout: 5 * 60_000 });
  await page.waitForTimeout(800);
  await shot(page, "rally-court-check", { fullPage: true });
  await page.getByRole("button", { name: /Looks right/ }).click();

  // Analysis runs in a worker; the page shows progress, then the overlay player.
  await expect(page.getByText(/Analysing/).first()).toBeVisible({ timeout: 60_000 });
  await shot(page, "rally-analysing");
  await expect(page.getByRole("button", { name: /Export video/ })).toBeVisible({ timeout: 25 * 60_000 });
  await page.waitForTimeout(1500);
  await shot(page, "rally-session", { fullPage: true });

  // The engine tracked the players: every one has a row with an estimated distance.
  const players = page.getByRole("row").filter({ hasText: /~\d+ m/ });
  expect(await players.count()).toBeGreaterThanOrEqual(2);

  // Rallies and shots need a clip that contains a whole rally (the full sample, ideally on a GPU machine:
  // RALLY_EXPECT_SHOTS=1). Then: real counts, and a correction is saved.
  if (process.env.RALLY_EXPECT_SHOTS) {
    const rallies = Number(await page.getByText("Rallies", { exact: true }).locator("..").locator(".tabular").innerText());
    const shots = Number(await page.getByText("Shots", { exact: true }).first().locator("..").locator(".tabular").innerText());
    expect(rallies).toBeGreaterThan(0);
    expect(shots).toBeGreaterThanOrEqual(rallies);
    await page.locator('select[aria-label="Type"]').nth(1).selectOption("smash");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible({ timeout: 20_000 });
  }

  // Export the session as a vertical clip that follows the action, with the overlay burned in.
  await page.getByRole("button", { name: /Export video/ }).click();
  const sheet = page.getByRole("dialog", { name: "Export video" });
  await sheet.getByRole("button", { name: process.env.RALLY_EXPECT_SHOTS ? /^Rallies/ : /^Whole video/ }).click();
  await sheet.getByRole("button", { name: /^Vertical 9:16/ }).click();
  await sheet.getByRole("button", { name: /^Follow the action/ }).click();
  await page.waitForTimeout(1500);
  await shot(page, "rally-export");
  await sheet.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeVisible({ timeout: 15 * 60_000 });
  await shot(page, "rally-export-done");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const file = await (await download).path();
  expect(readFileSync(file).subarray(4, 8).toString("latin1")).toBe("ftyp");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // The session is on the server too (synced summary), and the list shows it as analysed.
  await page.getByRole("link", { name: "Rally analysis" }).first().click();
  await expect(page.getByText("Analysed").first()).toBeVisible();
  await shot(page, "rally-list");

  // The coach's profile shows the rally card once the coach is linked as a player.
  expect(errors).toEqual([]);
});
