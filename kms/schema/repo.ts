import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";

export const ROOT = join(__dirname, "..", "..");
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".open-next",
  ".wrangler",
  ".vercel",
]);

// kms/site-*/content/ is assembled build output (kms/scripts/assemble.ts), gitignored
// except its hand-authored index.mdx/_meta.json — never a source of truth. Walking it
// would index the same doc twice (source path + assembled copy) and isn't even
// deterministic in CI, since the assembled copies don't exist on a fresh checkout.
//
// specs/templates/ holds copy-and-fill templates with deliberately invalid placeholder
// values (id: REPLACE-ME-..., updated: REPLACE-ME-YYYY-MM-DD) — not a real doc, and
// walking it would hard-fail kms:validate on the template itself once gate-wired.
const EXCLUDE_PATH_PATTERN = /^(kms\/site-[^/]+\/content|specs\/templates)(\/|$)/;

// Sorted for deterministic output — readdirSync's order isn't guaranteed across
// platforms/filesystems, and build-index.ts's output needs to be diff-stable.
export function walk(dir: string, out: string[] = []): string[] {
  for (const entry of [...readdirSync(dir)].sort()) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (EXCLUDE_PATH_PATTERN.test(relPath(full))) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (/\.mdx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

export function relPath(file: string): string {
  return relative(ROOT, file).replace(/\\/g, "/");
}

// gray-matter (js-yaml) parses unquoted YYYY-MM-DD as a Date, not a string.
// Normalize back to an ISO date string before handing off to the schema.
export function normalize(data: Record<string, unknown>): Record<string, unknown> {
  const { updated } = data;
  if (updated instanceof Date) {
    return { ...data, updated: updated.toISOString().slice(0, 10) };
  }
  return data;
}

export function readFrontMatter(file: string): Record<string, unknown> {
  const raw = readFileSync(file, "utf8");
  return matter(raw).data;
}

export function readDoc(file: string) {
  const raw = readFileSync(file, "utf8");
  const parsed = matter(raw);
  return { data: parsed.data, content: parsed.content };
}
