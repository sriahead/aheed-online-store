import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Proves #252 — a request-scoped facade never lives inside `lib/repositories/`.
 *
 * WHY THIS TEST EXISTS AT ALL
 *
 * CLAUDE.md's repository-layer rule says every function exported from
 * `lib/repositories/<name>.ts` takes its Prisma client and `vendorId`/`userId`
 * as explicit parameters and reads no request context. That is what lets a plain
 * `tsx` script import a repository module in real Node and exercise it against a
 * real database — which is how `placeOrder`'s atomicity, the stock-decrement
 * compare-and-set, the loyalty and discount concurrency guards and the
 * order-lookup credential pair are actually verified. A single
 * context-resolving factory in one of those files breaks the property for the
 * WHOLE module, not just for itself: the file's contract becomes true of some
 * exports and not others.
 *
 * The rule was written after P7b (#216) and then broken nine more times, in
 * seven files, because nothing checked it. CLAUDE.md claimed
 * `tests/repository-vendor-scoping.test.ts` was the enforcement. It was not, and
 * could not be: that test asks whether an exported function QUERIES a
 * vendor-scoped model without taking a vendor id — a question about scoping, not
 * about location. Three of the nine facades (`getDiscountRepository`,
 * `getWebhookOrderService`, `getGuestOrderLookupService`) were invisible to it
 * precisely because they delegated to pure functions instead of inlining
 * queries, so they issued no Prisma call of their own for it to see. A tenth
 * written the same way would have been invisible too.
 *
 * WHAT THIS CHECKS, AND WHY THIS SHAPE
 *
 * It is an IMPORT-level, WHOLE-FILE check: no file in `lib/repositories/` may
 * contain a value import of a request-context module. Not a per-function
 * analysis, because a facade can reach request context through any number of
 * indirections and a function-level check would have to chase them; and not a
 * call-site grep, because the prose in these files legitimately names
 * `getCurrentVendorId()` when explaining why it is absent.
 *
 * An import either exists or it does not, which makes the check total: a facade
 * cannot be written in one of these files at all without tripping it, however it
 * is spelled.
 *
 * THERE IS NO ALLOWLIST, DELIBERATELY. `tests/repository-vendor-scoping.test.ts`
 * carries one because its invariant has genuine, individually-argued exceptions
 * (UK GDPR erasure's cross-vendor count; a webhook that arrives with no host).
 * This invariant has none — a facade always has somewhere else to live, and the
 * sibling `lib/<name>-service.ts` is that place. An allowlist here would only
 * ever be used to readmit the defect, and its own docstring records that a
 * 38-entry version of such a list "gets rubber-stamped rather than read — a
 * control that launders review rather than performing it."
 *
 * WHAT IT DOES NOT CATCH. A pure function that takes `vendorId` and forgets to
 * use it: that is the vendor-scoping test's job, and the two are complementary.
 * Nor does it stop a repository function from calling another module that itself
 * reads context — no static check short of whole-program analysis would, and no
 * such module exists in `lib/` today outside the banned list below.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPOSITORIES_DIR = join(REPO_ROOT, "lib", "repositories");

/**
 * Modules that can only answer from a live Workers request. `@/lib/db` is
 * deliberately NOT here: resolving a client is not reading request context, and
 * several compliant repository functions call `getPrisma()` internally while
 * still taking `vendorId` explicitly.
 */
const REQUEST_CONTEXT_MODULES = ["next/headers", "@/lib/tenant", "@/lib/auth", "@/lib/auth-rbac"];

interface Violation {
  file: string;
  line: number;
  module: string;
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  // `import type { X } from "..."` — the whole clause is erased at compile time.
  if (node.importClause?.isTypeOnly) return true;

  // `import { type X, type Y } from "..."` — every named binding erased.
  const bindings = node.importClause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0) {
    return bindings.elements.every((element) => element.isTypeOnly);
  }

  return false;
}

function findViolations(file: string): Violation[] {
  const source = readFileSync(join(REPOSITORIES_DIR, file), "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: Violation[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const specifier = statement.moduleSpecifier.text;
    if (!REQUEST_CONTEXT_MODULES.includes(specifier)) continue;
    if (isTypeOnlyImport(statement)) continue;

    found.push({
      file,
      line: sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1,
      module: specifier,
    });
  }

  return found;
}

describe("lib/repositories purity (#252)", () => {
  const files = readdirSync(REPOSITORIES_DIR).filter((f) => f.endsWith(".ts"));

  it("finds repository files to check", () => {
    // A glob that silently matches nothing is a test that always passes.
    expect(files.length).toBeGreaterThan(0);
  });

  it("no repository module imports request context", () => {
    const violations = files.flatMap(findViolations);

    const detail = violations
      .map(
        (v) =>
          `  lib/repositories/${v.file}:${v.line} imports ${v.module}\n` +
          `    → move the request-scoped facade to lib/${v.file.replace(/\.ts$/, "")}-service.ts ` +
          `(see lib/data-rights-service.ts), leaving pure functions that take prisma and vendorId explicitly.`,
      )
      .join("\n");

    expect(violations, violations.length === 0 ? "" : `\n${detail}\n`).toEqual([]);
  });
});
