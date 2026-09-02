import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { FrontMatter, trackFor, type Track } from "../schema/frontmatter";
import { ROOT, walk, relPath, normalize, readFrontMatter, readDoc } from "../schema/repo";

/**
 * Walks the repo, reads valid front-matter, derives track (audience -> track),
 * and writes ARTIFACT_INDEX.md grouped by track. Deterministic (sorted by path)
 * so `git diff --exit-code` is a meaningful staleness check once wired into CI.
 * Files with missing/invalid front-matter are silently excluded here — that's
 * kms:validate's job to report, not this generator's.
 */

const ARTIFACT_INDEX = "ARTIFACT_INDEX.md";
const RUNBOOK_DOCS = "app/(admin)/staff/runbook/docs.ts";

/**
 * Every file `main()` writes, repo-relative — the single source of truth for what
 * "the generated artefacts" means (#537).
 *
 * This exists because there were two outputs and only one was ever checked. The two go
 * stale under DIFFERENT conditions, which is what made that invisible rather than merely
 * narrow: ARTIFACT_INDEX.md renders front-matter only, while docs.ts embeds each
 * document's full body. So a content-only edit — a change-log row appended to
 * specs/roadmap.md without touching its front-matter, exactly what commit 122609c did —
 * rebuilds the index byte-identically and docs.ts differently. The staleness check passed
 * on the file that had not drifted, and /staff/runbook served a stale Roadmap article in
 * production with CI green throughout.
 *
 * `kms/scripts/check-generated.ts` and `scripts/sdd-check.ts` both derive their file list
 * from here rather than restating it, so a third output added to `main()` is covered the
 * moment it is added. Adding the missing path to each checker instead would have
 * reproduced the same defect one level up: two lists that must be remembered together.
 */
export const GENERATED_ARTIFACTS = [ARTIFACT_INDEX, RUNBOOK_DOCS] as const;

/**
 * ARTIFACT_INDEX.md carries a build timestamp and commit SHA; docs.ts does not (it is a
 * plain JSON.stringify). So only the index needs its footer normalised away before a
 * staleness comparison — for docs.ts an exact compare is correct, and normalising it would
 * only widen what a check can miss.
 */
export const NEEDS_FOOTER_NORMALISATION: readonly string[] = [ARTIFACT_INDEX];

const TRACK_TITLES: Record<Track, string> = {
  "internal-eng": "Track 1 — Internal / Engineering (`internal-eng`)  ·  audience: dev",
  "staff-ops": "Track 2 — Staff / Operations (`staff-ops`)  ·  audience: staff",
  "customer-help": "Track 3 — Customer / Help Centre (`customer-help`)  ·  audience: customer",
};
const TRACK_ORDER: Track[] = ["internal-eng", "staff-ops", "customer-help"];

function shortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

function renderRow(path: string, fm: FrontMatter): string {
  const title = `[${fm.title}](${path})`;
  return `| ${title} | ${fm.type} | ${fm.version} | ${fm.updated} | ${fm.status} | ${fm.visibility} | ${fm.summary} |`;
}

function main() {
  const files = walk(ROOT);
  const byTrack: Record<Track, string[]> = {
    "internal-eng": [],
    "staff-ops": [],
    "customer-help": [],
  };
  let total = 0;
  const allDocs = [];

  for (const file of files) {
    const docInfo = readDoc(file);
    if (Object.keys(docInfo.data).length === 0) continue;

    const result = FrontMatter.safeParse(normalize(docInfo.data));
    if (!result.success) continue; // kms:validate reports these; the generator just skips them

    const fm = result.data;
    const track = trackFor(fm);
    byTrack[track].push(renderRow(relPath(file), fm));
    total++;

    allDocs.push({
      id: relPath(file),
      title: fm.title,
      audience: fm.audience,
      visibility: fm.visibility,
      category: fm.type,
      summary: fm.summary,
      lastUpdated: fm.updated,
      content: docInfo.content,
    });
  }

  const timestamp = new Date().toISOString();
  const sha = shortSha();

  const sections = TRACK_ORDER.map((track) => {
    const rows = byTrack[track];
    const header = `## ${TRACK_TITLES[track]}\n\n| Artifact | Type | Ver | Updated | Status | Vis | Summary |\n|---|---|---|---|---|---|---|`;
    if (rows.length === 0) {
      return `${header}\n| _\`<no artifacts yet>\`_ | | | | | | |`;
    }
    return `${header}\n${rows.join("\n")}`;
  });

  const content = `<!--
  ARTIFACT_INDEX.md — GENERATED FILE. DO NOT EDIT BY HAND.
  Produced by: kms/scripts/build-index.ts (walks **/*.md(x), reads front-matter).
  Regenerated and diffed in CI (gates.yml) — a stale index fails the PR, exactly
  like the Gate-4 CHANGELOG check. Source of truth is each doc's front-matter, not
  this table. To change a row, edit that doc's front-matter and let CI rebuild.

  Columns: Artifact (title) · Type · Version · Updated · Status · Visibility · Summary
  Path is the link target. Grouped by derived track (audience → track).
-->

# Artifact Index

_Generated from front-matter across the repo. Last build: \`${timestamp}\` · commit \`${sha}\` · \`${total}\` artifacts._

**Legend** — Status: \`draft\` → \`review\` → \`approved\` → \`deprecated\` ·
Visibility: \`internal\` (dev/staff site, behind Access) · \`public\` (help centre).

---

${sections.join("\n\n")}
`;

  writeFileSync(join(ROOT, ARTIFACT_INDEX), content);
  writeFileSync(
    join(ROOT, RUNBOOK_DOCS),
    `export const DOC_ARTICLES: any[] = ${JSON.stringify(allDocs, null, 2)};\n`,
  );
  console.log(
    `build-index — wrote ${GENERATED_ARTIFACTS.join(" and ")} (${total} artifact(s) from ${files.length} scanned file(s))`,
  );
}

// Only build when run directly. `check-generated.ts`, `scripts/sdd-check.ts` and the test
// import GENERATED_ARTIFACTS from this module; without this guard, importing the constant
// would rewrite both artefacts as a side effect of the import — a checker that mutates the
// thing it is about to inspect can never report drift.
if (require.main === module) main();
