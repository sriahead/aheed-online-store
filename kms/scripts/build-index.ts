import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { FrontMatter, trackFor, type Track } from "../schema/frontmatter";
import { ROOT, walk, relPath, normalize, readFrontMatter } from "../schema/repo";

/**
 * Walks the repo, reads valid front-matter, derives track (audience -> track),
 * and writes ARTIFACT_INDEX.md grouped by track. Deterministic (sorted by path)
 * so `git diff --exit-code` is a meaningful staleness check once wired into CI.
 * Files with missing/invalid front-matter are silently excluded here — that's
 * kms:validate's job to report, not this generator's.
 */

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

  for (const file of files) {
    const data = readFrontMatter(file);
    if (Object.keys(data).length === 0) continue;

    const result = FrontMatter.safeParse(normalize(data));
    if (!result.success) continue; // kms:validate reports these; the generator just skips them

    const fm = result.data;
    const track = trackFor(fm);
    byTrack[track].push(renderRow(relPath(file), fm));
    total++;
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

  writeFileSync(join(ROOT, "ARTIFACT_INDEX.md"), content);
  console.log(
    `build-index — wrote ARTIFACT_INDEX.md (${total} artifact(s) from ${files.length} scanned file(s))`,
  );
}

main();
