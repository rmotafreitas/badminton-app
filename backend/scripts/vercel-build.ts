import { $ } from "bun";
import { promises as fs } from "node:fs";
import path from "node:path";

const outDir = ".vercel/output";
const funcDir = path.join(outDir, "functions", "index.func");
const entryJs = path.join(funcDir, "index.js");

async function main() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(funcDir, { recursive: true });

  // Bundle only our own source code (resolves @/ aliases).
  // Externalize ALL npm packages — they'll be installed fresh below.
  await $`bun build src/index.ts \
    --target=node \
    --format=esm \
    --external elysia \
    --external @elysiajs/cors \
    --external @elysiajs/swagger \
    --external @prisma/client \
    --external elysia-local-https \
    --external google-auth-library \
    --external jsonwebtoken \
    --external nodemailer \
    --external sharp \
    --external twilio \
    --minify-syntax --minify-whitespace \
    --outfile ${entryJs}`;

  // Create package.json with runtime deps + prisma (needed for generate)
  const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
  delete pkg.scripts;
  delete pkg.devDependencies;
  // Add prisma CLI temporarily for `prisma generate`
  pkg.dependencies.prisma = "^6.19.3";
  await fs.writeFile(
    path.join(funcDir, "package.json"),
    JSON.stringify({ ...pkg, type: "module" }, null, 2),
  );

  // Install production deps inside the function dir (Linux native binaries)
  await $`bun install --production --cwd ${funcDir}`;

  // Copy Prisma schema and generate client INSIDE the function dir
  // (runs on Vercel's Linux build → correct platform)
  await fs.mkdir(path.join(funcDir, "prisma"), { recursive: true });
  await fs.copyFile("prisma/schema.prisma", path.join(funcDir, "prisma", "schema.prisma"));
  await $`cd ${funcDir} && bunx prisma generate`;

  // Remove prisma CLI to reduce deploy size
  await $`cd ${funcDir} && bun remove prisma`;

  await fs.writeFile(
    path.join(funcDir, ".vc-config.json"),
    JSON.stringify(
      {
        runtime: "nodejs22.x",
        handler: "index.js",
        launcherType: "Nodejs",
        shouldAddHelpers: true,
      },
      null,
      2,
    ),
  );

  await fs.writeFile(
    path.join(outDir, "config.json"),
    JSON.stringify(
      {
        version: 3,
        routes: [{ src: "/(.*)", dest: "/index" }],
      },
      null,
      2,
    ),
  );

  console.log("Build Output API ready at .vercel/output");
}

main();
