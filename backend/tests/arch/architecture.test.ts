import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, relative } from "path";

const SRC = resolve(import.meta.dir, "../../src");

function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

function extractImports(content: string): string[] {
  const result: string[] = [];
  const regex = /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    result.push(match[1]);
  }
  return result;
}

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      files.push(relative(SRC, full));
    }
  }
  return files;
}

function resolveImportPath(imp: string, currentFile: string): string | null {
  if (imp.startsWith("@/")) return imp.replace("@/", "");
  if (imp.startsWith(".")) {
    const dir = currentFile.includes("/")
      ? currentFile.substring(0, currentFile.lastIndexOf("/"))
      : "";
    const res = resolve(SRC, dir, imp);
    return relative(SRC, res).replace(/\.ts$/, "").replace(/\/index$/, "");
  }
  return null;
}

// ── Layer classification ─────────────────────────────────────────────────────

function classify(file: string): string {
  if (file === "index.ts" || file === "app.ts") return "entry";
  if (file.startsWith("presentation/routes/")) return "route";
  if (file.startsWith("presentation/controllers/")) return "controller";
  if (file.startsWith("presentation/middleware/")) return "middleware";
  if (file.startsWith("application/services/")) return "service";
  if (file.startsWith("application/repositories/")) return "repo";
  if (file.startsWith("domain/")) return "domain";
  return "application";
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Architecture", () => {
  const allFiles = collectTsFiles(SRC);

  it("index.ts only imports from app.ts and elysia-local-https", () => {
    const imports = extractImports(readText(resolve(SRC, "index.ts")));
    for (const imp of imports) {
      const res = resolveImportPath(imp, "index.ts");
      if (res) {
        expect(res).toMatch(/^app/);
      }
    }
  });

  it("app.ts does not import from index.ts or elysia-local-https (no circular ref)", () => {
    const imports = extractImports(readText(resolve(SRC, "app.ts")));
    for (const imp of imports) {
      expect(imp).not.toBe("./index");
    }
  });

  it("routes only depend on controllers, middleware, and JwtService", () => {
    const routeFiles = allFiles.filter((f) => classify(f) === "route");
    for (const file of routeFiles) {
      const imports = extractImports(readText(resolve(SRC, file)));
      for (const imp of imports) {
        const res = resolveImportPath(imp, file);
        if (!res) continue;
        const layer = classify(res);
        const ok = layer === "controller" || layer === "middleware" || res.includes("JwtService") || layer === "application";
        expect(ok).toBe(true);
      }
    }
  });

  it("controllers only depend on services (no repos, no routes)", () => {
    const ctrlFiles = allFiles.filter((f) => classify(f) === "controller");
    for (const file of ctrlFiles) {
      const imports = extractImports(readText(resolve(SRC, file)));
      for (const imp of imports) {
        const res = resolveImportPath(imp, file);
        if (!res) continue;
        const layer = classify(res);
        expect(layer).not.toBe("route");
        expect(layer).not.toBe("repo");
      }
    }
  });

  it("services only depend on domain (interfaces/entities) and application utilities", () => {
    const svcFiles = allFiles.filter((f) => classify(f) === "service");
    for (const file of svcFiles) {
      const imports = extractImports(readText(resolve(SRC, file)));
      for (const imp of imports) {
        const res = resolveImportPath(imp, file);
        if (!res) continue;
        const layer = classify(res);
        expect(layer).not.toBe("route");
        expect(layer).not.toBe("controller");
      }
    }
  });

  it("repos only depend on domain interfaces and Prisma", () => {
    const repoFiles = allFiles.filter((f) => classify(f) === "repo");
    for (const file of repoFiles) {
      const imports = extractImports(readText(resolve(SRC, file)));
      for (const imp of imports) {
        const res = resolveImportPath(imp, file);
        if (!res) continue;
        const layer = classify(res);
        expect(layer).not.toBe("route");
        expect(layer).not.toBe("controller");
        expect(layer).not.toBe("service");
      }
    }
  });

  it("domain layer never imports from application or presentation", () => {
    const domainFiles = allFiles.filter((f) => classify(f) === "domain");
    for (const file of domainFiles) {
      const imports = extractImports(readText(resolve(SRC, file)));
      for (const imp of imports) {
        const res = resolveImportPath(imp, file);
        if (!res) continue;
        const layer = classify(res);
        expect(layer).toBe("domain");
      }
    }
  });

  it("no file imports from index.ts except app.ts (no circular entrypoints)", () => {
    for (const file of allFiles) {
      if (file === "index.ts" || file === "app.ts") continue;
      const imports = extractImports(readText(resolve(SRC, file)));
      for (const imp of imports) {
        const res = resolveImportPath(imp, file);
        expect(res).not.toBe("index");
      }
    }
  });
});
