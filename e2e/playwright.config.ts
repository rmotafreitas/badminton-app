import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./support/env";

/**
 * End-to-end against the real stack: the API (port 3100) on its own database (`bb_e2e`, reset and seeded by
 * global-setup), the Vite web app over HTTPS (port 5180, proxying /api), Mailpit for sign-in emails. Nothing here
 * touches the dev database or the dev servers' ports.
 */
export default defineConfig({
  testDir: "./specs",
  outputDir: "./.results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "./.report" }]],
  globalSetup: "./support/global-setup.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: E2E.webUrl,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-US",
    // The app defaults to Portuguese; the specs read the English copy (auth.spec checks the default).
    storageState: {
      cookies: [],
      origins: [{ origin: E2E.webUrl, localStorage: [{ name: "badminton-lang", value: "en-US" }] }],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /(rally|mobile)\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
    {
      name: "rally",
      testMatch: /rally\.spec/,
      timeout: 30 * 60_000,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"] },
      },
    },
  ],
  webServer: [
    {
      command: "bun apps/api/src/main.ts",
      cwd: "..",
      url: `${E2E.apiUrl}/api/health/ready`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: E2E.apiEnv,
      stdout: "pipe",
    },
    {
      command: `bun run --cwd apps/web dev --port ${E2E.webPort} --strictPort`,
      cwd: "..",
      url: E2E.webUrl,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 90_000,
      env: { API_HOST: "127.0.0.1", API_PORT: String(E2E.apiPort), IN_DEV: "local", VITE_GOOGLE_CLIENT_ID: "" },
    },
  ],
});
