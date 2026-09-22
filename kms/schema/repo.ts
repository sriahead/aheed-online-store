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
  // .claude/worktrees/<agent-id>/ is a full, separate checkout a forked sub-agent builds in —
  // its own specs/, docs/, CLAUDE.md, everything. Walking into it indexes that checkout's
  // entire artifact set as if it belonged to this one (599 vs the real ~99, live-hit
  // 2026-08-25 rebuilding after a worktree was left on disk). None of .claude/ is a KMS
  // source today, so excluding it outright loses nothing.
  ".claude",
]);

// kms/site-*/content/ is assembled build output (kms/scripts/assemble.ts), gitignored
// except its hand-authored index.mdx/_meta.json — never a source of truth. Walking it
// would index the same doc twice (source path + assembled copy) and isn't even
// deterministic in CI, since the assembled copies don't exist on a fresh checkout.
//
// specs/templates/ holds copy-and-fill templates with deliberately invalid placeholder
// values (id: REPLACE-ME-..., updated: REPLACE-ME-YYYY-MM-DD) — not a real doc, and
// walking it would hard-fail kms:validate on the template itself once gate-wired.
//
// graft/ is a locally generated code-navigation index: gitignored (/graft/) and untracked,
// so it exists on a machine that has run the graft indexer and NEVER exists on a CI
// checkout. Walking it made every count this module feeds machine-dependent — measured
// 2026-09-22 at b889d04, kms:validate scanned 1,281 files locally against ~628 in CI, with
// 653 of the 1,069 "no front-matter" warnings being graft cards. A coverage ratchet cannot
// be built on a denominator that differs between the two places it is checked (#861).
// Root-anchored, matching .gitignore: a directory named `graft` nested elsewhere is not ours
// to skip.
const EXCLUDE_PATH_PATTERN = /^(kms\/site-[^/]+\/content|specs\/templates|graft)(\/|$)/;

/**
 * The three per-slice files that deliberately carry NO front-matter and get NO
 * ARTIFACT_INDEX.md entry — `plan.md` carries the slice's single indexed entry instead.
 *
 * This is not a backlog. It is an existing, authoritative decision, stated in
 * specs/templates/feature-spec/build-notes.md ("slice-local, not a KMS artifact") and in
 * specs/sdd-workflow.md ("requirements.md/validation.md deliberately don't get their own
 * front-matter/index entry"), which is the authoritative source for delivery process.
 * kms:validate previously reported all 403 of them as warnings, which is how the KMS
 * strategy came to describe a deliberate exclusion as a 17%-coverage gap (U7, #861).
 *
 * Deliberately matched by exact filename, never by "any file in a slice directory": the
 * pilot's own kms-strategy-evaluation.md lives in a slice directory and IS a real indexed
 * document, and so are rls-experiment.md and migration-ledger.md, which stay ordinary
 * uncovered files in the ratchet baseline.
 */
const SLICE_LOCAL_PATTERN =
  /^specs\/\d{4}-\d{2}-\d{2}[^/]*\/(requirements|validation|build-notes)\.md$/;

export function isSliceLocal(rel: string): boolean {
  return SLICE_LOCAL_PATTERN.test(rel);
}

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

export function readDoc(file: string): { data: any; content: string } {
  const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const parsed = matter(raw);
  return { data: parsed.data, content: parsed.content };
}
