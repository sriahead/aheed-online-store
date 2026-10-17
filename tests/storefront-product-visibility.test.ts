import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * #1131 R2 — every storefront product read carries `category: visibleCategoryWhere`.
 *
 * WHY A SOURCE SCAN. Leaving the predicate off a read does not fail anything: the read still works,
 * and a hidden department's products quietly reappear in whichever list that read feeds. That is
 * exactly how this slice found them, in search, on product pages and in the sitemap. So this reads
 * `lib/repositories/products.ts` with the TypeScript compiler (the technique
 * `tests/repository-client-injection.test.ts` uses) and fails naming any read that lacks it.
 *
 * WHAT COUNTS. Every object literal holding `isActive: true` above the `Admin catalogue path` marker
 * (admin reads deliberately see hidden rows), wherever it sits — directly in a `prisma.product.*`
 * call's `where`, or built for one through `findPage(...)` or `combineWhere(...)`. The single
 * exemption is a literal inside a `prisma.category.*` call: that is a CATEGORY filter (e.g. the
 * spotlights' child lookup), and a category has no `category` relation.
 */

const FILE = join(__dirname, "..", "lib", "repositories", "products.ts");
const source = readFileSync(FILE, "utf8");
const sf = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true);
const marker = source.indexOf("Admin catalogue path");

type Literal = { node: ts.ObjectLiteralExpression; label: string };

function hasActiveTrue(node: ts.ObjectLiteralExpression): boolean {
  return node.properties.some(
    (p) =>
      ts.isPropertyAssignment(p) &&
      p.name.getText(sf) === "isActive" &&
      p.initializer.kind === ts.SyntaxKind.TrueKeyword,
  );
}

function carriesVisibility(node: ts.ObjectLiteralExpression): boolean {
  return node.properties.some(
    (p) =>
      ts.isPropertyAssignment(p) &&
      p.name.getText(sf) === "category" &&
      p.initializer.getText(sf) === "visibleCategoryWhere",
  );
}

/** The model of the nearest enclosing `prisma.<model>.<method>(...)` call, or null. */
function enclosingPrismaModel(node: ts.Node): string | null {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isCallExpression(n)) {
      const match = /^prisma\.(\w+)\.\w+$/.exec(n.expression.getText(sf));
      if (match) return match[1];
    }
  }
  return null;
}

function enclosingFunctionName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
  }
  return "(top level)";
}

const literals: Literal[] = [];
(function visit(node: ts.Node) {
  if (
    ts.isObjectLiteralExpression(node) &&
    node.getStart(sf) < marker &&
    hasActiveTrue(node) &&
    enclosingPrismaModel(node) !== "category"
  ) {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    literals.push({ node, label: `${enclosingFunctionName(node)} (line ${line})` });
  }
  ts.forEachChild(node, visit);
})(sf);

describe("storefront product reads filter on category visibility (#1131 R2)", () => {
  it("finds the Admin catalogue path marker", () => {
    expect(marker).toBeGreaterThan(0);
  });

  it("enumerates the storefront product filters", () => {
    // Twelve today. Not pinned to an exact number — adding a read is fine — but an empty list would
    // mean the scan silently found nothing to check.
    expect(literals.length).toBeGreaterThanOrEqual(10);
  });

  it("every one of them carries category: visibleCategoryWhere", () => {
    const missing = literals.filter((l) => !carriesVisibility(l.node)).map((l) => l.label);
    expect(missing).toEqual([]);
  });

  it("the spotlights' groupBy is among them", () => {
    expect(literals.some((l) => l.label.startsWith("listCategorySpotlights"))).toBe(true);
  });
});
