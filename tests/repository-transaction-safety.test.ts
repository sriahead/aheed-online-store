import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Proves #382 — no call site passes `getPrisma()` (HTTP mode) into a
 * repository function that needs a transaction-capable client, and no
 * repository function calls `.$transaction(` directly on `getPrisma()`.
 *
 * WHY THIS TEST EXISTS AT ALL
 *
 * Prisma 6's client-side query compiler (`engineType = "client"`, mandatory —
 * see CLAUDE.md) unconditionally wraps `updateMany` and `createMany` — and
 * only those two operations — in an internal transaction. `getPrisma()`'s
 * HTTP-mode adapter cannot execute that transaction and throws `Transactions
 * are not supported in HTTP mode`, regardless of `where`-clause shape or match
 * count (confirmed empirically against a live Neon DB — see
 * specs/2026-08-27-prisma-many-http-transaction-fix/plan.md). Separately, and
 * more simply, ANY `.$transaction()` call made directly on `getPrisma()`'s
 * client throws the same error unconditionally.
 *
 * WHY THIS IS A TWO-PASS, TWO-DIRECTORY CHECK, NOT A ONE-FILE LEXICAL ONE
 *
 * All three `updateMany`/`createMany` bugs #382 actually found looked, from
 * inside `lib/repositories/bundles.ts`/`discounts.ts` alone, completely
 * unremarkable: `prisma.bundle.updateMany(...)`, where `prisma` is just this
 * function's own explicit client parameter — exactly the pattern
 * `tests/repository-purity.test.ts` requires every repository export to have.
 * The defect was never in the repository function; it was in which concrete
 * client its *caller*, in a different file (`lib/bundles-service.ts`,
 * `lib/repositories/discounts.ts`'s own service wrapper), chose to pass in —
 * and `ReturnType<typeof getPrisma>` and `ReturnType<typeof getPrismaWs>` are
 * the same TypeScript type (both are just `PrismaClient`), so nothing catches
 * a `getPrisma()` handed to a parameter that needed `getPrismaWs()`.
 *
 * So this test runs in two passes:
 * - PASS 1 (scoped to `lib/repositories/*.ts`): find every named function
 *   whose body contains an `updateMany(`/`createMany(` call that is NOT
 *   lexically nested inside a `.$transaction(...)` callback. Mark that
 *   function's name "sensitive" — it needs whatever client its caller passes
 *   in to be transaction-capable, and there is nothing about calling it
 *   correctly that a reader could tell from its own body.
 * - PASS 2 (scoped to every `lib/*.ts` and `lib/repositories/*.ts` file, i.e.
 *   everywhere `getPrisma()`/`getPrismaWs()` can legally be called at all —
 *   `app/`, `features/`, `components/` are ESLint-forbidden from importing
 *   `@/lib/db`): find every call to a sensitive function whose first argument
 *   is a literal `getPrisma()` call, and report THAT call site — the actual
 *   place the fix belongs, which Pass 1 alone could never point at.
 *
 * Rule B is separate and simpler: no `.$transaction(` may be called directly
 * on a literal `getPrisma()` anywhere in `lib/repositories/*.ts` — the exact
 * shape of #382's fourth site (`vendor.ts`'s `updateVendorStorefrontConfig`).
 * This one IS self-contained and needs no cross-file pass.
 *
 * WHAT THIS DOES NOT CATCH. A sensitive function called via a local variable
 * (`const client = getPrisma(); sensitiveFn(client, ...)`) rather than the
 * inline `sensitiveFn(getPrisma(), ...)` this test looks for — genuine
 * whole-program data-flow tracing would be needed to catch that, which no
 * test in this codebase attempts (see `repository-purity.test.ts`'s own
 * "WHAT IT DOES NOT CATCH" for the precedent of documenting rather than
 * silently pretending a check is more total than it is). A function whose
 * sensitive client parameter isn't its first argument also isn't tracked —
 * every sensitive function found in this codebase to date takes its client
 * first, matching the documented convention in `lib/repositories/*.ts`'s own
 * module docstrings.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIB_DIR = join(REPO_ROOT, "lib");
const REPOSITORIES_DIR = join(LIB_DIR, "repositories");

interface Violation {
  file: string;
  line: number;
  rule: "A" | "B";
  detail: string;
}

function isPropertyAccessNamed(node: ts.Node, name: string): node is ts.PropertyAccessExpression {
  return ts.isPropertyAccessExpression(node) && node.name.text === name;
}

/** Walks up from `node` looking for an enclosing `X.$transaction(...)` call. */
function isInsideTransactionCallback(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isCallExpression(current) && isPropertyAccessNamed(current.expression, "$transaction")) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function parse(dir: string, file: string): ts.SourceFile {
  const source = readFileSync(join(dir, file), "utf8");
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** Pass 1 + Rule B, over `lib/repositories/*.ts`. */
function analyseRepositories(files: string[]): {
  sensitive: Set<string>;
  ruleBViolations: Violation[];
} {
  const sensitive = new Set<string>();
  const ruleBViolations: Violation[] = [];

  for (const file of files) {
    const sourceFile = parse(REPOSITORIES_DIR, file);

    function visitTopLevel(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name) {
        const fnName = node.name.text;
        let isSensitive = false;

        function visitBody(inner: ts.Node) {
          if (ts.isCallExpression(inner)) {
            const callee = inner.expression;
            if (
              ts.isPropertyAccessExpression(callee) &&
              (callee.name.text === "updateMany" || callee.name.text === "createMany") &&
              !isInsideTransactionCallback(inner)
            ) {
              isSensitive = true;
            }
          }
          ts.forEachChild(inner, visitBody);
        }
        if (node.body) visitBody(node.body);
        if (isSensitive) sensitive.add(fnName);
      }

      // Rule B: literal getPrisma().$transaction( anywhere in this file.
      if (ts.isCallExpression(node) && isPropertyAccessNamed(node.expression, "$transaction")) {
        const receiver = node.expression.expression;
        if (
          ts.isCallExpression(receiver) &&
          ts.isIdentifier(receiver.expression) &&
          receiver.expression.text === "getPrisma"
        ) {
          ruleBViolations.push({
            file,
            line: lineOf(sourceFile, node),
            rule: "B",
            detail: "getPrisma().$transaction(...) — must be getPrismaWs()",
          });
        }
      }

      ts.forEachChild(node, visitTopLevel);
    }

    visitTopLevel(sourceFile);
  }

  return { sensitive, ruleBViolations };
}

/** Pass 2, over every lib/*.ts and lib/repositories/*.ts file. */
function findUnsafeCallSites(dir: string, file: string, sensitive: Set<string>): Violation[] {
  const sourceFile = parse(dir, file);
  const found: Violation[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      sensitive.has(node.expression.text)
    ) {
      const firstArg = node.arguments[0];
      if (
        firstArg &&
        ts.isCallExpression(firstArg) &&
        ts.isIdentifier(firstArg.expression) &&
        firstArg.expression.text === "getPrisma"
      ) {
        found.push({
          file,
          line: lineOf(sourceFile, node),
          rule: "A",
          detail: `${node.expression.text}(getPrisma(), ...) — ${node.expression.text} needs a transaction-capable client; pass getPrismaWs()`,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

describe("lib/repositories transaction safety (#382)", () => {
  const repoFiles = readdirSync(REPOSITORIES_DIR).filter((f) => f.endsWith(".ts"));
  const libFiles = readdirSync(LIB_DIR).filter((f) => f.endsWith(".ts"));

  it("finds repository and lib files to check", () => {
    // A glob that silently matches nothing is a test that always passes.
    expect(repoFiles.length).toBeGreaterThan(0);
    expect(libFiles.length).toBeGreaterThan(0);
  });

  it("no call site passes getPrisma() to an updateMany/createMany-using function, no getPrisma().$transaction(", () => {
    const { sensitive, ruleBViolations } = analyseRepositories(repoFiles);

    const ruleAViolations = [
      ...repoFiles.flatMap((f) => findUnsafeCallSites(REPOSITORIES_DIR, f, sensitive)),
      ...libFiles.flatMap((f) => findUnsafeCallSites(LIB_DIR, f, sensitive)),
    ];

    const violations = [...ruleBViolations, ...ruleAViolations];
    const detail = violations
      .map((v) => `  ${v.file}:${v.line} [Rule ${v.rule}] ${v.detail}`)
      .join("\n");

    expect(violations, violations.length === 0 ? "" : `\n${detail}\n`).toEqual([]);
  });
});
