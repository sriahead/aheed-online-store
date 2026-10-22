import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

/**
 * Print, one per line and sorted, every name imported from `lucide-react` anywhere under `app`,
 * `components`, `features` or `lib` of a checkout (#1223, R31):
 *
 * `npx tsx scripts/list-lucide-imports.ts [--root <dir>]`
 *
 * `--root` exists so the list can be re-derived at BASE from a worktree after the migration has removed
 * every import from the working tree: `tests/fixtures/lucide-icons-in-use.json` is a snapshot of the
 * BASE state and this is the command that reproduces it. Parsed with the TypeScript compiler, so a
 * multi-line import, an aliased import (`X as Y` yields `X`) and `import type` are all read correctly;
 * a line grep undercounts (the true count at BASE is 102).
 */

const DIRECTORIES = ["app", "components", "features", "lib"];
const SKIP = new Set(["node_modules", ".next", ".open-next", ".wrangler", "generated"]);

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

export function lucideImportsIn(root: string): string[] {
  const names = new Set<string>();
  for (const directory of DIRECTORIES) {
    for (const file of sourceFiles(join(root, directory))) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("lucide-react")) continue;
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        if (
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          statement.moduleSpecifier.text !== "lucide-react"
        )
          continue;
        const bindings = statement.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const element of bindings.elements) {
          if (element.isTypeOnly || statement.importClause?.isTypeOnly) continue;
          names.add((element.propertyName ?? element.name).text);
        }
      }
    }
  }
  return [...names].sort();
}

if (process.argv[1] && /list-lucide-imports/.test(process.argv[1])) {
  const rootIndex = process.argv.indexOf("--root");
  const root = resolve(rootIndex === -1 ? process.cwd() : process.argv[rootIndex + 1]);
  for (const name of lucideImportsIn(root)) console.log(name);
}
