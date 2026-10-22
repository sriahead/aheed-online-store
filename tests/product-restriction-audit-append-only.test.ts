import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #1211 (R28, ADR-007) — ProductRestrictionAuditLog is append-only BY CONSTRUCTION: no code in
 * the application, its scripts or its seed may update or delete a row. A restriction decision is a
 * compliance record; one that can be edited afterwards is not a record. Migrations are excluded
 * (DDL, not application code).
 */

const ROOT = join(__dirname, "..");
const SCANNED = ["lib", "app", "features", "components", "scripts", "prisma"];
const MUTATION =
  /productRestrictionAuditLog\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\s*\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "migrations" || name === "node_modules" ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("ProductRestrictionAuditLog is append-only (R28)", () => {
  const files = SCANNED.flatMap((dir) => sourceFiles(join(ROOT, dir)));

  it("scans a real tree, including the repository that writes the log", () => {
    expect(files.map((f) => relative(ROOT, f).split("\\").join("/"))).toContain(
      "lib/repositories/product-restrictions.ts",
    );
  });

  it("nothing updates, upserts or deletes an audit row", () => {
    const offenders = files
      .filter((file) => MUTATION.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
