import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Nothing in the reference-data pipeline deletes except the decommission path (#770).
 *
 * WHY THIS TEST EXISTS
 *
 * Until this slice, the pipeline could not delete at all, and several of its files said so in
 * prose: `sync-service.ts` promised "Nothing is deleted at any point", `source.ts` and
 * `code-point.ts` both explained that rows are "marked inactive rather than deleting" them. That
 * was a real guarantee with a real justification — a postcode OS withdraws must stay explicable to
 * an `Address` that already holds it — and the scheduled monthly sync still relies on it.
 *
 * Adding one deliberate deletion path puts that guarantee at the mercy of the next edit. A
 * `deleteMany` added to `applyPostcodeRecords` for a plausible-sounding reason would be invisible
 * to `lint`, `typecheck` and every other test, would pass review as easily as any other tidy-up,
 * and would run unattended against production on the third of the month.
 *
 * WHAT THIS CHECKS
 *
 * A CALL EXPRESSION to `.delete(...)` or `.deleteMany(...)` anywhere under `lib/reference-data/`
 * or in `lib/repositories/reference-coverage.ts`, outside the functions named below.
 *
 * Deliberately an AST check rather than a grep, for the reason CLAUDE.md records three separate
 * times: these files DISCUSS deletion at length — that is the whole point of their comments — so a
 * substring search matches the explanations and can only be satisfied by removing them. Matching
 * the construct rather than the word means the prose can stay.
 *
 * THE ALLOWLIST IS BY FUNCTION NAME, NOT BY FILE, deliberately. A file-level exemption would let a
 * second delete appear in `code-point.ts` beside the sanctioned one; naming the function means a
 * new deleting function has to be added here, which is the moment someone has to justify it.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PIPELINE_DIR = join(REPO_ROOT, "lib", "reference-data");
const COVERAGE_REPOSITORY = join(REPO_ROOT, "lib", "repositories", "reference-coverage.ts");

/**
 * The only functions permitted to delete, and why each one is:
 *
 * - `decommissionPostcodeAreas` / `decommissionPlaceAreas` — remove one unsupported area's rows,
 *   always filtered on `postcodeArea`.
 * - `removeAreaCoverage` — withdraws the claim of authority, and must run BEFORE the two above.
 * - `decommissionUnsupportedAreas` — the orchestrator; its own deletes are those three, plus
 *   nothing.
 */
const PERMITTED_FUNCTIONS = new Set([
  "decommissionPostcodeAreas",
  "decommissionPlaceAreas",
  "removeAreaCoverage",
  "decommissionUnsupportedAreas",
]);

interface Violation {
  file: string;
  line: number;
  enclosing: string;
  method: string;
}

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsFilesUnder(full);
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

/**
 * The nearest named FUNCTION enclosing a node, or `<top level>`.
 *
 * Deliberately not the nearest named anything: `const result = await prisma.x.deleteMany(...)`
 * would otherwise attribute the delete to `result`, which is both useless in the failure message
 * and — worse — a name no allowlist would ever contain, so every delete would look like a
 * violation and the allowlist would silently stop meaning anything.
 */
function enclosingName(node: ts.Node): string {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) &&
      current.name &&
      ts.isIdentifier(current.name)
    ) {
      return current.name.text;
    }
    // A function assigned to a name, e.g. `const foo = async () => {…}` or `{ foo: () => {…} }`.
    if (
      (ts.isVariableDeclaration(current) || ts.isPropertyAssignment(current)) &&
      ts.isIdentifier(current.name) &&
      current.initializer &&
      (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
    ) {
      return current.name.text;
    }
    current = current.parent;
  }
  return "<top level>";
}

function findViolations(absolutePath: string): Violation[] {
  const relative = absolutePath.slice(REPO_ROOT.length).replace(/\\/g, "/");
  const source = readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true);
  const found: Violation[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "delete" || node.expression.name.text === "deleteMany")
    ) {
      const enclosing = enclosingName(node);
      if (!PERMITTED_FUNCTIONS.has(enclosing)) {
        found.push({
          file: relative,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          enclosing,
          method: node.expression.name.text,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

describe("reference-data deletion is confined to the decommission path (#770)", () => {
  const files = [...tsFilesUnder(PIPELINE_DIR), COVERAGE_REPOSITORY];

  it("finds pipeline files to check", () => {
    // A directory walk that silently matches nothing is a test that always passes.
    expect(files.length).toBeGreaterThan(3);
  });

  it("no delete outside the four permitted functions", () => {
    const violations = files.flatMap(findViolations);

    const detail = violations
      .map(
        (v) =>
          `  ${v.file}:${v.line} calls .${v.method}() inside ${v.enclosing}\n` +
          `    → a refresh must never delete: the monthly scheduled sync runs unattended against ` +
          `production, and a postcode withdrawn upstream has to stay explicable to an Address that ` +
          `already holds it. If this delete is genuinely a decommission, it belongs in one of ` +
          `${[...PERMITTED_FUNCTIONS].join(", ")}.`,
      )
      .join("\n");

    expect(violations, violations.length === 0 ? "" : `\n${detail}\n`).toEqual([]);
  });

  it("the permitted deletes actually exist, so the check cannot pass by absence", () => {
    // Without this, deleting the decommission feature entirely would leave the test above green.
    const deletingFunctions = new Set(
      files.flatMap((file) => {
        const relative = file.slice(REPO_ROOT.length).replace(/\\/g, "/");
        const sourceFile = ts.createSourceFile(
          relative,
          readFileSync(file, "utf8"),
          ts.ScriptTarget.Latest,
          true,
        );
        const names: string[] = [];
        const visit = (node: ts.Node) => {
          if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            (node.expression.name.text === "delete" || node.expression.name.text === "deleteMany")
          ) {
            names.push(enclosingName(node));
          }
          ts.forEachChild(node, visit);
        };
        visit(sourceFile);
        return names;
      }),
    );

    expect([...deletingFunctions].sort()).toEqual(
      ["decommissionPlaceAreas", "decommissionPostcodeAreas", "removeAreaCoverage"].sort(),
    );
  });
});
