/**
 * Bundles the API into one file (every @bb/* package inlined) next to a node_modules with only its runtime npm
 * dependencies and a Prisma client generated for the machine that runs this. Used by the Vercel build and the Docker
 * image.
 *
 *   bun apps/api/scripts/bundle.ts --entry src/main.ts --out /out --target bun
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { $ } from "bun";

const root = path.resolve(import.meta.dir, "../../..");

async function runtimeDependencies(): Promise<Record<string, string>> {
  const manifests = ["apps/api", "packages/infrastructure", "packages/contracts", "packages/config"].map((dir) =>
    Bun.file(path.join(root, dir, "package.json")).json(),
  );
  const deps: Record<string, string> = {};
  for (const manifest of await Promise.all(manifests)) {
    for (const [name, version] of Object.entries<string>(manifest.dependencies ?? {})) {
      if (!version.startsWith("workspace:")) deps[name] = version;
    }
  }
  return deps;
}

export async function bundle({ entry, out, target }: { entry: string; out: string; target: "bun" | "node" }) {
  await fs.mkdir(out, { recursive: true });
  const deps = await runtimeDependencies();
  const externals = Object.keys(deps).flatMap((name) => ["--external", name]);
  await $`bun build ${path.resolve(import.meta.dir, "..", entry)} --target=${target} --format=esm ${externals} --minify-syntax --minify-whitespace --outfile ${path.join(out, "index.js")}`;
  // Only the runtime dependencies: the Prisma CLI (and its config/engines/effect tree) never enters the function.
  await Bun.write(path.join(out, "package.json"), JSON.stringify({ name: "badminton-api", type: "module", dependencies: deps }, null, 2));
  await $`bun install --production --cwd ${out}`;
  await generatePrismaClient(out);
  await prune(out);
}

/**
 * Generates the Prisma client into the bundle's own node_modules with the repository's CLI, for this machine only
 * (Vercel builds on the platform it runs on; the Docker build stage matches its runtime image).
 *
 * It runs from a scratch directory outside the repository whose node_modules links to the bundle's: from inside the
 * repo Prisma finds the root CLI, decides the bundle's @prisma/client is too far from it, and tries to npm-install
 * its own (then fails).
 */
async function generatePrismaClient(out: string) {
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), "bb-prisma-"));
  try {
    const schema = await Bun.file(path.join(root, "packages/infrastructure/prisma/schema.prisma")).text();
    const nativeOnly = schema.replace(/binaryTargets\s*=\s*\[[^\]]*\]/, 'binaryTargets = ["native"]');
    await Bun.write(path.join(stage, "prisma", "schema.prisma"), nativeOnly);
    await Bun.write(path.join(stage, "package.json"), JSON.stringify({ name: "prisma-stage", private: true }));
    await fs.symlink(path.join(out, "node_modules"), path.join(stage, "node_modules"), "dir");
    await $`${path.join(root, "node_modules/.bin/prisma")} generate --schema ${path.join(stage, "prisma", "schema.prisma")}`
      .cwd(stage)
      .env({ ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" });
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

/**
 * What a cold start would otherwise download and unpack for nothing: Prisma's engines for other databases and
 * runtimes (wasm, edge), source maps, and sharp's binaries for the other libc.
 */
async function prune(out: string) {
  const modules = path.join(out, "node_modules");
  const runtime = path.join(modules, "@prisma/client/runtime");
  const unused = /\.map$|^query_(compiler|engine)_bg\.|^(edge|wasm|react-native)|^binary\./;
  for (const file of await fs.readdir(runtime)) {
    if (unused.test(file)) await fs.rm(path.join(runtime, file), { force: true });
  }
  const musl = process.platform === "linux" && !(process.report?.getReport() as { header?: { glibcVersionRuntime?: string } }).header?.glibcVersionRuntime;
  const otherLibc = musl ? /^sharp-(libvips-)?linux-/ : /^sharp-(libvips-)?linuxmusl-/;
  const img = path.join(modules, "@img");
  for (const pkg of await fs.readdir(img).catch(() => [] as string[])) {
    if (otherLibc.test(pkg)) await fs.rm(path.join(img, pkg), { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { entry: { type: "string" }, out: { type: "string" }, target: { type: "string" } } });
  if (!values.entry || !values.out) throw new Error("--entry and --out are required");
  await bundle({ entry: values.entry, out: path.resolve(values.out), target: values.target === "node" ? "node" : "bun" });
}
