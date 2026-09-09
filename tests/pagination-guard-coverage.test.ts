import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Proves #682 — no list in `lib/repositories/` hands Prisma a cursor that has
 * not been through `keysetCursorArgs`.
 *
 * WHY THIS TEST EXISTS
 *
 * The unguarded idiom `...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})`
 * appeared at FIVE call sites — `findPage`, `listInventoryForStaff` and
 * `listProductsForAdmin` in `products.ts`, plus two list functions in
 * `orders.ts` — and each one was individually unremarkable. `parseSearchOffset`
 * in the same `products.ts` had guarded the ranked-search offset since #564,
 * with a comment explaining precisely why a URL cursor is untrusted, and that
 * reasoning was simply never carried across.
 *
 * A prose list of "the sites that are guarded" is what this repo already tried
 * for staff-panel refusals, and CLAUDE.md records how that ended: the list was
 * wrong in two directions at once and was only discovered by walking the
 * filesystem. So this is the filesystem walk, with NO ALLOWLIST — a sixth list
 * function is covered the moment its file exists.
 *
 * WHAT THIS CHECKS
 *
 * An object literal property named `cursor` whose value is an object literal —
 * i.e. the `cursor: { id: ... }` argument Prisma actually takes. Checked on the
 * parsed TypeScript AST rather than by grep, for the same reason
 * `tests/repository-client-injection.test.ts` uses an AST: these files
 * legitimately discuss cursors in prose. `lib/repositories/pagination.ts`'s own
 * docstring contains the literal string `cursor: { id: ["x", "y"] }` as the
 * failure it exists to prevent, and `products.ts` still explains keyset
 * pagination in comments above every call site. A substring check could only be
 * satisfied by deleting those explanations — the exact trap
 * `specs/sdd-workflow.md` records prior instances of.
 *
 * `pagination.ts` itself is the one file allowed to construct the argument,
 * because constructing it correctly is what that module is.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPOSITORIES_DIR = join(REPO_ROOT, "lib", "repositories");
const GUARD_FILE = "pagination.ts";

interface Violation {
  file: string;
  line: number;
}

function findViolations(file: string): Violation[] {
  const source = readFileSync(join(REPOSITORIES_DIR, file), "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: Violation[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === "cursor" &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      found.push({
        file,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

describe("lib/repositories keyset cursor guard (#682)", () => {
  const present = readdirSync(REPOSITORIES_DIR).filter((f) => f.endsWith(".ts"));

  it("finds repository files to check", () => {
    // A glob that silently matches nothing is a test that always passes.
    expect(present.length).toBeGreaterThan(0);
  });

  it("the guard module itself exists and is the only exception", () => {
    expect(present).toContain(GUARD_FILE);
  });

  it("no repository list builds a Prisma cursor argument by hand", () => {
    const violations = present.filter((f) => f !== GUARD_FILE).flatMap(findViolations);

    const detail = violations
      .map(
        (v) =>
          `  lib/repositories/${v.file}:${v.line} builds a Prisma cursor argument directly\n` +
          `    → spread ...keysetCursorArgs(cursor) from ` +
          `lib/repositories/pagination.ts instead. A raw URL cursor reaching Prisma ` +
          `renders an empty list for a stale id (HTTP 200, no error) and throws ` +
          `PrismaClientValidationError for a repeated ?cursor= parameter (HTTP 500). ` +
          `Both were reproduced live in #682.`,
      )
      .join("\n");

    expect(violations, violations.length === 0 ? "" : `\n${detail}\n`).toEqual([]);
  });
});
