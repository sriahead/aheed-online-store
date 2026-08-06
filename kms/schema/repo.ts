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

// Sorted for deterministic output — readdirSync's order isn't guaranteed across
// platforms/filesystems, and build-index.ts's output needs to be diff-stable.
export function walk(dir: string, out: string[] = []): string[] {
  for (const entry of [...readdirSync(dir)].sort()) {
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
