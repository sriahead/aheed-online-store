/**
 * SDD loop forcing function — one check, two entry points.
 *
 *   npm run sdd:preclear   Before a Clear: is everything load-bearing actually on disk?
 *   npm run sdd:audit      At Orient: did the last shipped slice get its roadmap entry?
 *
 * The loop's whole bet is "persist before clear" and "documentation actually lands".
 * Both were prose in specs/sdd-workflow.md, which is how three slices (P3a/P3b/P3c)
 * shipped with no roadmap change-log entry. This turns both into exit codes.
 *
 * Base-ref resolution, the offline no-block posture, and the --no-verify style escape
 * hatch are copied from hooks/pre-push (Gate 4) so all the SDD checks behave alike.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readFrontMatter } from "../kms/schema/repo";

/**
 * Slices at or before this one predate the loop (specs/sdd-workflow.md 2.0.0) and are
 * deliberately NOT audited — retroactively policing them would report gaps nobody
 * agreed to fill. Slice dirs are YYYY-MM-DD-prefixed, so a lexicographic compare is
 * chronological. Caveat: two slices created on the same day order by slug, so a
 * same-day sibling could sort either side of this. The audit reports rather than
 * blocks, so that's tolerable; bump this constant when a phase closes.
 *
 * SDD_LOOP_BASELINE overrides it, so the audit can be exercised against slices whose
 * outcome is already known instead of only ever being run on the live repo state.
 */
const LOOP_BASELINE_SLICE = process.env.SDD_LOOP_BASELINE ?? "2026-08-10-p3c-stripe-payments";

const REQUIRED_SPEC_FILES = ["plan.md", "requirements.md", "validation.md", "build-notes.md"];

/** Must match specs/templates/feature-spec/build-notes.md — the template is this check's contract. */
const REQUIRED_BUILD_NOTE_HEADINGS = [
  "## What changed and why",
  "## Decisions taken during the build",
  "## Deviations from the spec",
  "## Known-shaky areas",
];

const SLICE_DIR = /^\d{4}-\d{2}-\d{2}-/;

function sh(cmd: string): string | null {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** origin/staging, else origin/main, else null (offline — callers must not block). */
function resolveBaseRef(): string | null {
  for (const ref of ["origin/staging", "origin/main"]) {
    if (sh(`git rev-parse --verify ${ref}`)) return ref;
  }
  return null;
}

function sliceDirs(): string[] {
  const specs = join(ROOT, "specs");
  return readdirSync(specs)
    .filter((d) => SLICE_DIR.test(d) && statSync(join(specs, d)).isDirectory())
    .sort();
}

function fail(msg: string): void {
  console.error(`  ✘ ${msg}`);
}

function pass(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

// ---------------------------------------------------------------- preclear

function preclear(): number {
  console.log("sdd:preclear — is everything load-bearing on disk before the Clear?\n");

  const baseRef = resolveBaseRef();
  if (!baseRef) {
    console.log("  neither origin/staging nor origin/main resolves (offline?) — not blocking.");
    return 0;
  }

  const base = sh(`git merge-base HEAD ${baseRef}`);
  const head = sh("git rev-parse HEAD");
  if (!base || base === head) {
    console.log(`  nothing to check relative to ${baseRef} — not blocking.`);
    return 0;
  }

  const committed = (sh(`git diff --name-only ${base}...HEAD`) ?? "").split("\n").filter(Boolean);
  const porcelain = (sh("git status --porcelain") ?? "").split("\n").filter(Boolean);
  const dirtyPaths = porcelain.map((l) => l.slice(3).trim());

  // Slice detection spans committed + uncommitted, so an uncommitted spec folder is
  // still recognised as the slice under work (and then caught by the clean-tree check).
  const slices = [
    ...new Set(
      [...committed, ...dirtyPaths]
        .map((p) => /^specs\/(\d{4}-\d{2}-\d{2}-[^/]+)\//.exec(p)?.[1])
        .filter((s): s is string => Boolean(s)),
    ),
  ].sort();

  if (slices.length === 0) {
    console.log(`  no specs/<date-slice>/ touched on this branch (vs ${baseRef}) — not blocking.`);
    console.log("  (a docs-only or tooling branch has no slice to pre-check)");
    return 0;
  }

  let failures = 0;

  for (const slice of slices) {
    console.log(`slice: specs/${slice}/`);
    for (const file of REQUIRED_SPEC_FILES) {
      const full = join(ROOT, "specs", slice, file);
      if (!existsSync(full)) {
        fail(`${file} is missing — the Clear would destroy whatever it should have held`);
        failures++;
        continue;
      }
      if (file === "build-notes.md") {
        const body = readFileSync(full, "utf8");
        const missing = REQUIRED_BUILD_NOTE_HEADINGS.filter((h) => !body.includes(h));
        if (missing.length > 0) {
          fail(`build-notes.md is missing required section(s): ${missing.join(", ")}`);
          failures++;
          continue;
        }
      }
      pass(file);
    }
  }

  console.log("\nbranch:");
  if (committed.includes("CHANGELOG.md")) {
    pass(`CHANGELOG.md differs from ${baseRef} (Gate 4)`);
  } else {
    fail(
      `CHANGELOG.md was not updated on this branch (vs ${baseRef}) — Gate 4 lands here, not after Ship`,
    );
    failures++;
  }

  if (porcelain.length === 0) {
    pass("working tree is clean — nothing lives only in the editor");
  } else {
    fail(`working tree is not clean (${porcelain.length} uncommitted path(s)):`);
    for (const p of porcelain.slice(0, 10)) console.error(`      ${p}`);
    if (porcelain.length > 10) console.error(`      … and ${porcelain.length - 10} more`);
    failures++;
  }

  if (failures > 0) {
    console.error(`\nNOT safe to /clear — ${failures} check(s) failed.`);
    console.error("Commit the work, or accept the loss deliberately. A Clear is not recoverable.");
    return 1;
  }

  console.log("\nSafe to /clear. Switch to Sonnet 5 (/model claude-sonnet-5) for Validate.");
  return 0;
}

// ------------------------------------------------------------------- audit

/** First segment of the front-matter id — `p3c-stripe-payments` -> `p3c`. */
function sliceToken(slice: string): string {
  const plan = join(ROOT, "specs", slice, "plan.md");
  if (existsSync(plan)) {
    const id = readFrontMatter(plan).id;
    if (typeof id === "string" && id.length > 0) return id.split("-")[0];
  }
  return slice.replace(SLICE_DIR, "").split("-")[0];
}

function audit(): number {
  console.log("sdd:audit — did shipped slices get their roadmap entry?\n");
  console.log(`  baseline: slices after ${LOOP_BASELINE_SLICE} (earlier ones predate the loop)\n`);

  const slices = sliceDirs().filter((d) => d > LOOP_BASELINE_SLICE);
  if (slices.length === 0) {
    console.log("  no slices under the new loop yet — nothing to audit.");
    return 0;
  }

  // Change-log rows, paired with their own date. A row only counts as documenting a
  // slice if it is dated on/after that slice — otherwise a pre-existing row that merely
  // *mentions* future work would satisfy the check for the slice it predicts. That is a
  // live trap, not a hypothetical: the P3a/P3b/P3c backfill row names P3d ("Shop your
  // list"), so without this an eventual P3d slice would pass while undocumented.
  const roadmapRows = readFileSync(join(ROOT, "specs", "roadmap.md"), "utf8")
    .split("\n")
    .map((l) => /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ date: m[1], text: m.input }));
  const index = readFileSync(join(ROOT, "ARTIFACT_INDEX.md"), "utf8");

  let gaps = 0;

  for (const slice of slices) {
    const token = sliceToken(slice);
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    const sliceDate = slice.slice(0, 10);
    const inRoadmap = roadmapRows.some(
      (row) =>
        row.date >= sliceDate &&
        (pattern.test(row.text) ||
          row.text.includes(slice) ||
          row.text.includes(`specs/${slice}/`)),
    );
    // The index is already enforced at merge by gates.yml's staleness check; this only
    // confirms the slice's plan.md actually reached the table, which a missed rebuild
    // before that check ran would show up as.
    const inIndex = index.includes(`specs/${slice}/plan.md`);

    console.log(`slice: specs/${slice}/  (token "${token}")`);
    if (inRoadmap) pass("roadmap change-log entry found");
    else {
      fail("NO roadmap change-log entry mentions this slice");
      gaps++;
    }
    if (inIndex) pass("present in ARTIFACT_INDEX.md");
    else {
      fail("NOT in ARTIFACT_INDEX.md — run npm run kms:build-index");
      gaps++;
    }
  }

  if (gaps > 0) {
    console.error(`\n${gaps} documentation gap(s). The Document (final) pass did not land.`);
    console.error(
      "Fix on the CURRENT branch — post-merge doc changes ride the next slice's branch.",
    );
    return 1;
  }

  console.log("\nAll slices under the loop are documented.");
  return 0;
}

// -------------------------------------------------------------------- main

const mode = process.argv[2];
if (mode === "preclear") process.exit(preclear());
else if (mode === "audit") process.exit(audit());
else {
  console.error("usage: tsx scripts/sdd-check.ts <preclear|audit>");
  process.exit(2);
}
