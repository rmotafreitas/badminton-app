/**
 * Vercel Build Output API for the API project (Vercel project root: apps/api): one Node function with the bundled
 * API and its runtime dependencies, plus the daily cron.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { bundle } from "./bundle";

const outDir = path.resolve(import.meta.dir, "../.vercel/output");
const funcDir = path.join(outDir, "functions", "index.func");
/** `API_REGION=dub1` (or `fra1,cdg1`): Vercel region ids, https://vercel.com/docs/regions. */
const regions = (process.env.API_REGION ?? "").split(",").map((r) => r.trim()).filter(Boolean);

await fs.rm(outDir, { recursive: true, force: true });
await bundle({ entry: "src/vercel.ts", out: funcDir, target: "node" });
await Bun.write(
  path.join(funcDir, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.js",
      launcherType: "Nodejs",
      shouldAddHelpers: true,
      // Pinned here, not left to the platform: outside "production" sign-in emails and SMS are only logged.
      environment: { NODE_ENV: "production" },
      // Next to the database: every request makes 2–5 MongoDB round trips, so a function on another continent from
      // Atlas adds ~100 ms to each of them. Unset: the project's default function region.
      ...(regions.length > 0 && { regions }),
    },
    null,
    2,
  ),
);
await Bun.write(
  path.join(outDir, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [{ src: "/(.*)", dest: "/index" }],
      // Daily: expired review videos, sessions, sign-in codes, rate-limit windows (Vercel sends CRON_SECRET as a Bearer).
      crons: [{ path: "/api/maintenance/daily", schedule: "17 4 * * *" }],
    },
    null,
    2,
  ),
);
// biome-ignore lint/suspicious/noConsole: build script output
console.log("Build Output API ready at apps/api/.vercel/output");
