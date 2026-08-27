import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Proves #409 — no export in `lib/repositories/` resolves its own Prisma client.
 *
 * WHY THIS TEST EXISTS
 *
 * CLAUDE.md's repository-layer rule has two halves: an export takes its Prisma
 * client as an explicit parameter, AND it reads no request context. Only the
 * second half was ever enforced. `tests/repository-purity.test.ts` covers it, and
 * its docstring deliberately excluded `@/lib/db` on the reasoning that "resolving
 * a client is not reading request context, and several compliant repository
 * functions call `getPrisma()` internally while still taking `vendorId`
 * explicitly."
 *
 * That reasoning was wrong, and it had been wrong since the rule was written. The
 * rule's whole purpose is that a plain `tsx` script can import a repository module
 * in real Node and exercise it against a real database — which is how placeOrder's
 * atomicity, the stock-decrement compare-and-set, the loyalty and discount
 * concurrency guards and the order-lookup credential pair are actually verified.
 *
 * A function that resolves its own client cannot do that AT ALL. `lib/db.ts`
 * imports `PrismaClient` from `@prisma/client/wasm`, which is mandatory on
 * Workers (a bare specifier resolves to the `node` export condition and dies on
 * `fs.readFileSync`). Node cannot load that build's WASM query compiler. Measured
 * 2026-08-27 against the dev Neon branch:
 *
 *   getAvailableSpecialities(prisma, vendorId)  -> PASS  (client injected)
 *   getVendorConfig(vendorId)                   -> FAIL  ERR_UNKNOWN_FILE_EXTENSION
 *                                                        query_compiler_bg.wasm
 *   the same query via the script's own client  -> PASS
 *
 * So "compliant" described 32 functions that were, in fact, unreachable from a
 * script by construction. This is the THIRD time this rule has named an
 * enforcement it did not have; CLAUDE.md records the first two.
 *
 * WHAT THIS CHECKS
 *
 * A CALL EXPRESSION to `getPrisma`/`getPrismaWs` anywhere in a repository file.
 * Deliberately not a bare-word or text match: these files legitimately NAME both
 * functions in prose (`lib/repositories/discounts.ts` explains "getPrismaWs(),
 * not getPrisma()" for the #382 constraint) and in type positions
 * (`ReturnType<typeof getPrisma>` is the documented way to type the parameter).
 * A grep would match all of those, and could only be satisfied by deleting the
 * explanation — the exact trap specs/sdd-workflow.md records four prior
 * instances of. An AST call-expression check matches the construct that actually
 * constitutes the defect, and nothing else.
 *
 * THERE IS NO FUNCTION-LEVEL ALLOWLIST, DELIBERATELY, for the same reason
 * `tests/repository-purity.test.ts` refuses one: a resolution always has
 * somewhere else to live, and the sibling `lib/<name>-service.ts` is that place.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPOSITORIES_DIR = join(REPO_ROOT, "lib", "repositories");

const CLIENT_RESOLVERS = new Set(["getPrisma", "getPrismaWs"]);

/**
 * TEMPORARY — the files #409 slice 1 has actually cleared.
 *
 * 32 exports across 8 files resolved their own client when #409 was opened.
 * Slice 1 (#410) cleared these four; slice 2 (#411) takes categories.ts,
 * loyalty.ts and vendor.ts; slice 3 (#412) takes products.ts and then DELETES
 * this constant so the check applies to the whole directory.
 *
 * This is a list of FILES, not of functions or symbols. It scopes how much of
 * the directory is under the check yet — it cannot exempt an individual
 * function inside a file that is in scope, so it cannot be used to readmit the
 * defect in covered territory. Adding a new repository file leaves it unchecked
 * until #412 lands, which is the one real gap and is why #412 is not optional.
 */
const FILES_IN_SCOPE = ["customers.ts", "discounts.ts", "order-lookup-rate-limit.ts", "reports.ts"];

interface Violation {
  file: string;
  line: number;
  resolver: string;
}

function findViolations(file: string): Violation[] {
  const source = readFileSync(join(REPOSITORIES_DIR, file), "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: Violation[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      CLIENT_RESOLVERS.has(node.expression.text)
    ) {
      found.push({
        file,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        resolver: node.expression.text,
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

describe("lib/repositories client injection (#409)", () => {
  const present = readdirSync(REPOSITORIES_DIR).filter((f) => f.endsWith(".ts"));

  it("finds repository files to check", () => {
    // A glob that silently matches nothing is a test that always passes.
    expect(present.length).toBeGreaterThan(0);
  });

  it("every file in scope still exists", () => {
    // A renamed or deleted file would otherwise drop out of the check silently.
    const missing = FILES_IN_SCOPE.filter((f) => !present.includes(f));
    expect(missing, `scoped file(s) no longer in lib/repositories: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("no repository module in scope resolves its own Prisma client", () => {
    const violations = FILES_IN_SCOPE.flatMap(findViolations);

    const detail = violations
      .map(
        (v) =>
          `  lib/repositories/${v.file}:${v.line} calls ${v.resolver}()\n` +
          `    → take the client as a parameter and resolve it in ` +
          `lib/${v.file.replace(/\.ts$/, "")}-service.ts instead ` +
          `(see lib/customers-service.ts). A self-resolving export cannot run in a ` +
          `plain tsx script: lib/db uses @prisma/client/wasm, which Node cannot load.`,
      )
      .join("\n");

    expect(violations, violations.length === 0 ? "" : `\n${detail}\n`).toEqual([]);
  });
});
