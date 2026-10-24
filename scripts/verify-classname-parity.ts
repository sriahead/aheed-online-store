import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { compareFile } from "./lib/classname-parity";

/**
 * Check that a `lucide-react` to `Icon` migration changed no icon's `className` or other props (#1223, R58).
 *
 * `npx tsx scripts/verify-classname-parity.ts --base-root <dir> --head-root <dir>
 *      [--allow <path>]... [--require-migrated]`
 *
 * Roots are checkouts of the two trees (BASE is normally a worktree of the commit before the slice). Every
 * `.ts` or `.tsx` file under `app`, `components`, `features` and `lib` that exists in both is parsed with the
 * TypeScript compiler; the Lucide elements at BASE and the `Icon` elements at HEAD must pair up in document
 * order with equal `className` and equal other props (`aria-hidden` aside), and no HEAD element may carry
 * `size`, `tone`, `label` or a spread. A file that still imports `lucide-react` at HEAD is "not migrated":
 * reported and accepted, unless `--require-migrated` makes it a failure. `--allow` skips a file whose markup
 * changed shape by design (a component passed as a prop became a name); R34 and R35 prove those live.
 *
 * Progress and every `file:line: reason` failure go to stderr. Exit 0 only when nothing failed.
 * It proves the source is unchanged, not the rendered markup: that is `verify-icon-markup.ts`.
 */

const SCAN_ROOTS = ["app", "components", "features", "lib"];

function argValues(flag: string): string[] {
  const values: string[] = [];
  process.argv.forEach((arg, index) => {
    if (arg === flag && process.argv[index + 1]) values.push(process.argv[index + 1]);
  });
  return values;
}

function sourceFiles(root: string, directory: string, found: string[]): void {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || relative === "components/icons") continue;
      sourceFiles(root, relative, found);
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(relative);
    }
  }
}

function main(): number {
  const [baseRoot] = argValues("--base-root");
  const [headRoot] = argValues("--head-root");
  if (!baseRoot || !headRoot) {
    console.error(
      "usage: verify-classname-parity.ts --base-root <dir> --head-root <dir> [--allow <path>]... [--require-migrated]",
    );
    return 2;
  }
  const base = resolve(baseRoot);
  const head = resolve(headRoot);
  const allow = new Set(argValues("--allow").map((path) => path.replace(/\\/g, "/")));
  const requireMigrated = process.argv.includes("--require-migrated");

  const failures: string[] = [];
  for (const path of allow) {
    if (!existsSync(join(base, path)) || !existsSync(join(head, path)))
      failures.push(`${path}:1: --allow names a file that is not in both trees`);
  }

  const baseFiles: string[] = [];
  for (const root of SCAN_ROOTS) sourceFiles(base, root, baseFiles);

  let checked = 0;
  let notMigrated = 0;
  let allowed = 0;
  for (const path of baseFiles.sort()) {
    if (!existsSync(join(head, path))) continue;
    if (allow.has(path)) {
      allowed += 1;
      continue;
    }
    const baseText = readFileSync(join(base, path), "utf8");
    const headText = readFileSync(join(head, path), "utf8");
    if (!/lucide-react|components\/icons/.test(baseText + headText)) continue;

    checked += 1;
    const verdict = compareFile(path, baseText, headText);
    if (verdict.status === "not-migrated") {
      notMigrated += 1;
      console.error(`${path}:1: not migrated (still imports lucide-react)`);
      if (requireMigrated) failures.push(`${path}:1: still imports lucide-react at HEAD`);
    } else if (verdict.status === "failed") {
      failures.push(...verdict.failures);
    }
  }

  for (const failure of failures) console.error(failure);
  console.error(`checked ${checked} file(s), ${notMigrated} not migrated, ${allowed} allowed`);
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = main();
