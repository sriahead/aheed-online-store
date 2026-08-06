import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";
import { FrontMatter } from "./frontmatter";

/**
 * Walks the repo for markdown files (.md / .mdx), validates any front-matter block
 * against the FrontMatter schema. Files with no front-matter are reported as
 * warnings, not failures — most existing docs haven't been backfilled yet (see
 * requirements.md). Files WITH a front-matter block that fails schema validation
 * are hard failures.
 */

const ROOT = join(__dirname, "..", "..");
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".open-next",
  ".wrangler",
  ".vercel",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (/\.mdx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// gray-matter (js-yaml) parses unquoted YYYY-MM-DD as a Date, not a string.
// Normalize back to an ISO date string before handing off to the schema.
function normalize(data: Record<string, unknown>): Record<string, unknown> {
  const { updated } = data;
  if (updated instanceof Date) {
    return { ...data, updated: updated.toISOString().slice(0, 10) };
  }
  return data;
}

function main() {
  const files = walk(ROOT);
  const noFrontMatter: string[] = [];
  const invalid: { file: string; errors: string[] }[] = [];
  let valid = 0;

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const { data } = matter(raw);
    const relPath = relative(ROOT, file).replace(/\\/g, "/");

    if (Object.keys(data).length === 0) {
      noFrontMatter.push(relPath);
      continue;
    }

    const result = FrontMatter.safeParse(normalize(data));
    if (result.success) {
      valid++;
    } else {
      invalid.push({
        file: relPath,
        errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
  }

  console.log(`kms:validate — scanned ${files.length} markdown file(s)`);
  console.log(`  valid front-matter: ${valid}`);
  console.log(`  no front-matter (warning, not blocking): ${noFrontMatter.length}`);
  if (noFrontMatter.length > 0) {
    for (const f of noFrontMatter) console.log(`    - ${f}`);
  }
  console.log(`  invalid front-matter (failing): ${invalid.length}`);
  if (invalid.length > 0) {
    for (const { file, errors } of invalid) {
      console.log(`    ✘ ${file}`);
      for (const e of errors) console.log(`        ${e}`);
    }
    process.exitCode = 1;
  }
}

main();
