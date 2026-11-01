import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Proves #1223 R32 - an icon library is imported only inside `components/icons/`.
 *
 * Every icon in the app is reached through `<Icon name="…" />` (ADR-008), so a provider can change
 * without touching a component. A direct `lucide-react` or `@iconify*` import anywhere else puts a
 * provider id back into component code and defeats that. The migration finished in Phase 2b; this
 * test is what keeps it finished.
 *
 * THERE IS NO ALLOWLIST, DELIBERATELY. `components/icons/` is the one place the rule does not
 * apply and it is excluded by path, not listed by file.
 *
 * It reads the TypeScript AST, not text, so prose that names `lucide-react` (the generated runbook
 * docs, comments) is not a violation, and a multi-line, aliased, `import type`, re-export or dynamic
 * `import()` form is still caught.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIRECTORIES = ["app", "components", "features", "lib"];
const SKIP = new Set(["node_modules", ".next", ".open-next", ".wrangler"]);
const ICONS_DIRECTORY = `components${sep}icons${sep}`;

function isBannedSpecifier(specifier: string): boolean {
  return (
    specifier === "lucide-react" ||
    specifier.startsWith("lucide-react/") ||
    specifier.startsWith("@iconify")
  );
}

/** Every banned module specifier that `text` imports, re-exports or dynamically imports. */
export function bannedIconImports(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    let specifier: ts.Expression | undefined;
    if (ts.isImportDeclaration(node)) specifier = node.moduleSpecifier;
    else if (ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0
    ) {
      specifier = node.arguments[0];
    }
    if (specifier && ts.isStringLiteralLike(specifier) && isBannedSpecifier(specifier.text)) {
      found.push(specifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function* sourceFiles(directory: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx)$/.test(entry)) yield path;
  }
}

describe("icon library imports (#1223, R32)", () => {
  it("no file outside components/icons imports lucide-react or an @iconify module", () => {
    const violations: string[] = [];
    for (const directory of DIRECTORIES) {
      for (const file of sourceFiles(join(ROOT, directory))) {
        const rel = relative(ROOT, file);
        if (rel.startsWith(ICONS_DIRECTORY)) continue;
        for (const specifier of bannedIconImports(rel, readFileSync(file, "utf8"))) {
          violations.push(`${rel}: imports "${specifier}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  }, 15000);

  it("the checker can fail: it flags each import form in an in-memory file", () => {
    const text = [
      `import { Search } from "lucide-react";`,
      `import type { LucideIcon } from "lucide-react";`,
      `import Icon from "@iconify/react";`,
      `import data from "@iconify-json/lucide/icons.json";`,
      `export { Heart } from "lucide-react";`,
      `const lazy = () => import("lucide-react/dynamicIconImports");`,
    ].join("\n");
    expect(bannedIconImports("app/violation.tsx", text)).toEqual([
      "lucide-react",
      "lucide-react",
      "@iconify/react",
      "@iconify-json/lucide/icons.json",
      "lucide-react",
      "lucide-react/dynamicIconImports",
    ]);
  });

  it("the checker ignores prose and unrelated modules", () => {
    const text = [
      `import { Icon } from "@/components/icons/Icon";`,
      `// import { Search } from "lucide-react";`,
      `const note = "from lucide-react";`,
    ].join("\n");
    expect(bannedIconImports("app/clean.tsx", text)).toEqual([]);
  });
});
