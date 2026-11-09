import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Dependency rules (mirroring the ASMR app's ADR-0007):
 *   domain ← application ← infrastructure ← bootstrap ← apps/api
 * The web app sees @bb/contracts, plus the API's TYPE (import type) for Eden. `../` imports are not allowed.
 */
const ROOT = join(import.meta.dir, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === "routeTree.gen.ts") return [];
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

interface Import {
  readonly file: string;
  readonly spec: string;
  readonly typeOnly: boolean;
}

function imports(dir: string): Import[] {
  return files(join(ROOT, dir)).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    const found: Import[] = [];
    const pattern = /^\s*(import|export)\s+(type\s+)?(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/gm;
    for (const m of text.matchAll(pattern)) found.push({ file: relative(ROOT, file), spec: m[3]!, typeOnly: !!m[2] });
    for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) found.push({ file: relative(ROOT, file), spec: m[1]!, typeOnly: false });
    return found;
  });
}

const packageOf = (spec: string) => (spec.startsWith("@bb/") ? spec.split("/").slice(0, 2).join("/") : null);

const ALLOWED: Record<string, readonly string[]> = {
  "packages/domain/src": [],
  "packages/contracts/src": [],
  "packages/config/src": [],
  "packages/application/src": ["@bb/domain"],
  "packages/infrastructure/src": ["@bb/domain", "@bb/application"],
  "packages/bootstrap/src": ["@bb/application", "@bb/config", "@bb/infrastructure"],
  "apps/api/src": ["@bb/domain", "@bb/application", "@bb/contracts", "@bb/config", "@bb/bootstrap"],
  "apps/web/src": ["@bb/contracts"],
};

const THIRD_PARTY_FREE = ["packages/domain/src", "packages/application/src"];

describe("architecture", () => {
  for (const [dir, allowed] of Object.entries(ALLOWED)) {
    it(`${dir} imports only ${allowed.join(", ") || "no other @bb package"}`, () => {
      const offending = imports(dir).filter((i) => {
        const pkg = packageOf(i.spec);
        if (!pkg) return false;
        // The one exception (ADR-0006 of the ASMR app): the web app reads the API's type for Eden, type-only, root only.
        if (dir === "apps/web/src" && i.spec === "@bb/api" && i.typeOnly) return false;
        return !allowed.includes(pkg);
      });
      expect(offending).toEqual([]);
    });
  }

  it("no `../` imports anywhere (use ./x or @/x)", () => {
    const offending = Object.keys(ALLOWED).flatMap((dir) => imports(dir)).filter((i) => i.spec.startsWith("../"));
    expect(offending).toEqual([]);
  });

  it("domain and application have no third-party imports", () => {
    const offending = THIRD_PARTY_FREE.flatMap((dir) => imports(dir)).filter(
      (i) => !i.spec.startsWith(".") && !i.spec.startsWith("@/") && !i.spec.startsWith("@bb/") && !i.spec.startsWith("node:"),
    );
    expect(offending).toEqual([]);
  });

  it("routes never touch Prisma, S3 or the infrastructure directly", () => {
    const offending = imports("apps/api/src").filter((i) => /prisma|@bb\/infrastructure|aws4fetch/.test(i.spec));
    expect(offending).toEqual([]);
  });

  it("web: a feature reaches another feature only through its index; shared/ imports no feature", () => {
    const offending = imports("apps/web/src").filter((i) => {
      const from = i.file.replace("apps/web/src/", "");
      const target = i.spec.match(/^@\/features\/([^/]+)(\/.*)?$/);
      if (from.startsWith("shared/") && i.spec.startsWith("@/features/")) return true;
      if (!target) return false;
      const ownFeature = from.match(/^features\/([^/]+)\//)?.[1];
      if (ownFeature === target[1]) return false; // inside the same feature, any file
      // Routes may compose a feature's lazy pages directly (code-split entries).
      if (from.startsWith("routes/") && /^\/ui\/\w+Page$|^\/lab\/LabPage$|^\/components\/login-page$/.test(target[2] ?? "")) return false;
      return target[2] !== undefined;
    });
    expect(offending).toEqual([]);
  });

  it("only the config package reads process.env", () => {
    const offending = Object.keys(ALLOWED)
      .filter((dir) => dir !== "packages/config/src" && dir !== "apps/web/src")
      .flatMap((dir) => files(join(ROOT, dir)))
      .filter((file) => readFileSync(file, "utf8").includes("process.env"))
      .map((file) => relative(ROOT, file));
    expect(offending).toEqual([]);
  });
});
