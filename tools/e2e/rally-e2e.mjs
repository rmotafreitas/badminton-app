/**
 * End-to-end check of Rally Analysis in a real (headless) Chromium:
 * login → import video → court check → on-device analysis → cloud upload →
 * review correction → export with overlay → download.
 *
 *   cd web && RALLY_VIDEO=/path/clip.mp4 bun ../tools/e2e/rally-e2e.mjs
 *
 * Env: APP_URL (https://localhost:5173), RALLY_EMAIL/RALLY_PASSWORD
 * (seeded admin), RALLY_VIDEO (required), CHROME (executable, optional),
 * BROWSER=webkit (Safari's engine; no WebGPU on Linux, so analysis uses WASM),
 * OUT_DIR (screenshots + export, default ./rally-e2e-out).
 * Needs the dev stack (Mongo, SeaweedFS, backend, web) and models in
 * web/public/models. WebGPU flags are passed; without a GPU it falls back to WASM.
 */
import { chromium, webkit } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const APP = process.env.APP_URL ?? "https://localhost:5173";
const VIDEO = process.env.RALLY_VIDEO;
const OUT = (process.env.OUT_DIR ?? "rally-e2e-out") + "/";
if (!VIDEO) throw new Error("Set RALLY_VIDEO to a video file");
mkdirSync(OUT, { recursive: true });

const browser =
  process.env.BROWSER === "webkit"
    ? await webkit.launch({ headless: true })
    : await chromium.launch({
        headless: true,
        executablePath: process.env.CHROME,
        args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
      });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

try {
  const login = await page.request.post(`${APP}/api/auth/complete`, {
    data: { provider: "password", input: { email: process.env.RALLY_EMAIL ?? "admin@email.local", password: process.env.RALLY_PASSWORD ?? "password" } },
  });
  if (!login.ok()) throw new Error(`login failed: ${login.status()}`);
  await page.goto(`${APP}/analysis`, { waitUntil: "load" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Import video/ }).click();
  await (await chooser).setFiles(VIDEO);
  await page.waitForURL(/\/analysis\/rs-/, { timeout: 30000 });
  log("imported");

  await page.getByText("Is this the court?").waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + "court-check.png", fullPage: true });
  await page.getByRole("button", { name: /Looks right/ }).click();
  log("court confirmed");

  await page.getByRole("button", { name: /Export video/ }).waitFor({ timeout: 1500000 });
  log("analysed");
  await page.screenshot({ path: OUT + "session.png", fullPage: true });

  const type = page.locator('select[aria-label="Type"]').nth(1);
  if (await type.count()) {
    await type.selectOption("smash");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("button", { name: "Saved" }).waitFor({ timeout: 20000 });
    log("correction saved");
  }

  await page.getByRole("button", { name: /Export video/ }).click();
  await page.getByRole("button", { name: "Download", exact: true }).waitFor({ timeout: 900000 });
  const dl = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await (await dl).saveAs(OUT + "export.mp4");
  const head = readFileSync(OUT + "export.mp4").subarray(4, 8).toString("latin1");
  if (head !== "ftyp") throw new Error("export is not an MP4");
  log("exported", OUT + "export.mp4");
  if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);
  log("PASS");
} finally {
  await browser.close();
}
