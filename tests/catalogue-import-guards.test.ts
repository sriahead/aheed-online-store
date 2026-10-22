import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #1216 R7, R15, R18, R19, R28, R30 — structural guards over the importer's own source. They read
 * files, so they are cheap and catch the regression a unit test of behaviour would not: someone
 * importing the spreadsheet package into the Worker bundle, forwarding a literal `isActive: true`,
 * logging a connection string, or adding a delete.
 *
 * Each pattern targets the SYNTAX that would constitute the defect, not a word the explanatory
 * comments legitimately use (specs/sdd-workflow.md, the absence-grep traps) — comments are stripped
 * before matching so the rationale can stay in the files.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(path);
  }
  return out;
}

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const LIB_FILES = readdirSync("lib/catalogue-import").map((f) => `lib/catalogue-import/${f}`);
const SCRIPT_FILES = [
  "scripts/import-catalogue.ts",
  "scripts/verify-onboarding.ts",
  "scripts/verify-catalogue-import.ts",
  "scripts/lib/dev-client.ts",
  "scripts/lib/read-spreadsheet.ts",
  "scripts/lib/manifest-readiness.ts",
];

describe("the spreadsheet package stays out of the Worker bundle (R7)", () => {
  it.each(["app", "features", "components", "lib", "prisma"])(
    "no file under %s/ imports @e965/xlsx",
    (dir) => {
      const offenders = walk(dir).filter((f) => /["']@e965\/xlsx["']/.test(code(f)));
      expect(offenders).toEqual([]);
    },
  );

  it("is imported by exactly one script file", () => {
    const importers = walk("scripts").filter((f) => /["']@e965\/xlsx["']/.test(code(f)));
    expect(importers).toEqual(["scripts/lib/read-spreadsheet.ts"]);
  });

  it("the pure core imports neither Prisma nor the spreadsheet package", () => {
    for (const file of LIB_FILES) {
      expect(code(file), file).not.toMatch(/from ["'](?:@prisma\/|@e965\/)/);
    }
  });
});

describe("the write set is the policy's (R15)", () => {
  const apply = code("lib/catalogue-import/apply.ts");
  const plan = code("lib/catalogue-import/plan.ts");

  it("plans every product's state through newImportedProductState", () => {
    expect(plan).toMatch(/newImportedProductState\(/);
  });

  it("writes isActive, restriction and stockMode from the plan, never from a literal", () => {
    expect(apply).toMatch(/isActive: planned\.isActive/);
    expect(apply).toMatch(/restriction: planned\.restriction/);
    expect(apply).toMatch(/stockMode: planned\.stockMode/);
    expect(apply).not.toMatch(/stockMode:\s*["']/);
    // A `select: { isActive: true }` READ is fine; a write of `true` is not.
    expect(apply.replace(/select:\s*\{[^}]*\}/g, "")).not.toMatch(/isActive:\s*true/);
  });

  it("has no field for barcode, supplier, cost or stock in any write", () => {
    for (const file of ["lib/catalogue-import/apply.ts", "lib/catalogue-import/plan.ts"]) {
      expect(code(file), file).not.toMatch(
        /\b(?:barcode|supplier|costPrice|costPence|caseSize|reorder)\w*\s*:/i,
      );
    }
  });
});

describe("a dry run opens no connection, and an apply is guarded first (R18, R19)", () => {
  const importer = code("scripts/import-catalogue.ts");

  it("constructs a Prisma client only after the dry-run branch has returned", () => {
    expect(importer.indexOf("if (!apply)")).toBeGreaterThan(-1);
    expect(importer.indexOf("new PrismaClient(")).toBeGreaterThan(importer.indexOf("if (!apply)"));
  });

  it("runs the host guard before constructing any client, in every script that connects", () => {
    expect(importer.indexOf("assertNotDeployedDatabase(")).toBeGreaterThan(-1);
    expect(importer.indexOf("assertNotDeployedDatabase(")).toBeLessThan(
      importer.indexOf("new PrismaClient("),
    );
    const dev = code("scripts/lib/dev-client.ts");
    expect(dev.indexOf("assertNotDeployedDatabase(")).toBeLessThan(
      dev.indexOf("new PrismaClient("),
    );
    for (const file of ["scripts/verify-onboarding.ts", "scripts/verify-catalogue-import.ts"]) {
      expect(code(file), file).not.toMatch(/new PrismaClient\(/);
      expect(code(file), file).toMatch(/connectDev\(/);
    }
  });

  it("the guard has no override: no flag or variable skips it", () => {
    expect(importer).not.toMatch(/--force|--skip-guard|ALLOW_DEPLOYED/i);
  });
});

describe("nothing is logged that could leak a secret (R28)", () => {
  it.each(SCRIPT_FILES)("%s never passes process.env or a connection string to console", (file) => {
    const source = code(file);
    expect(source).not.toMatch(/console\.\w+\([^;]*process\.env/);
    expect(source).not.toMatch(/console\.\w+\([^;]*connectionString/);
    expect(source).not.toMatch(/JSON\.stringify\(\s*process\.env/);
  });
});

describe("nothing is deleted and no raw SQL is written (R30)", () => {
  it.each([...LIB_FILES, ...SCRIPT_FILES.filter((f) => !f.includes("readiness"))])(
    "%s has no delete, deleteMany or raw query",
    (file) => {
      const source = code(file);
      expect(source).not.toMatch(/\.(?:delete|deleteMany)\(/);
      expect(source).not.toMatch(/\$(?:queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)/);
    },
  );

  it("the only write the verification script makes is its single, can-never-succeed probe insert", () => {
    const source = code("scripts/verify-catalogue-import.ts");
    const writes = source.match(/\.(?:create|createMany|update|updateMany|upsert)\(/g) ?? [];
    expect(writes).toEqual([".create("]);
  });

  it("verify-onboarding writes nothing", () => {
    expect(code("scripts/verify-onboarding.ts")).not.toMatch(
      /\.(?:create|createMany|update|updateMany|upsert)\(/,
    );
  });
});
