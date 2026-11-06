import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
// Runs every truth.json rally clip through the real engine via the /lab page
// (with the dataset's court corners) and saves results incl. raw detections.
//   cd web && DATA=/path/to/data/ bun ../tools/eval/shuttleset/run.mjs
const DIR = process.env.DATA ?? process.env.HOME + "/.cache/rally-lab/shuttleset/";
const truth = JSON.parse(readFileSync(DIR + "truth.json", "utf8"));
mkdirSync(DIR + "results", { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME, args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 900, height: 1400 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 200)));
await page.goto((process.env.APP_URL ?? "https://localhost:5173") + "/lab", { waitUntil: "load" });
await page.waitForFunction(() => !document.body.innerText.includes("Detecting…"), null, { timeout: 60000 });
for (const r of truth.rallies) {
  const out = DIR + "results/" + r.clip.split("/")[1].replace(".mp4", ".json");
  if (existsSync(out) && !process.env.FORCE) continue;
  await page.evaluate(() => { delete window.__rallyLastResult; });
  await page.locator('input[type="file"]').setInputFiles(DIR + r.clip);
  await page.getByTestId("corners").fill(process.env.AUTO ? "" : JSON.stringify(truth.corners));
  await page.getByRole("button", { name: /^Analyse/ }).click();
  await page.waitForFunction(() => !!window.__rallyLastResult || /Analysis failed/.test(document.querySelector("header p.font-mono")?.textContent ?? ""), null, { timeout: 900000 });
  const json = await page.evaluate(() => JSON.stringify(window.__rallyLastResult ?? null));
  writeFileSync(out, json);
  console.log(new Date().toISOString().slice(11, 19), r.clip, json === "null" ? "FAILED" : "ok");
}
await browser.close();
