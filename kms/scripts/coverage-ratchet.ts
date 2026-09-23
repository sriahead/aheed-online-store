import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT, walk, relPath, readFrontMatter, isSliceLocal } from "../schema/repo";

/**
 * The coverage ratchet (KMS strategy §19.2, #861).
 *
 * A checked-in baseline records how many markdown files in each directory carry no KMS
 * front-matter. CI fails when the measured counts and the baseline disagree. It never fails for
 * the existing backlog — that is already in the baseline — so the debt is strictly non-growing
 * from the day this lands, without blocking any current work.
 *
 * WHY THIS EXISTS AT ALL. `kms:validate` reported 1,042 uncovered files as a non-blocking
 * warning and exited 0. A warning emitted a thousand times is not a warning, and nothing stopped
 * the number climbing — it reached 1,069 in the eight days before this slice.
 *
 * WHY IT LANDS BEFORE THE MIGRATION, NOT AFTER. §24 step 8: the ratchet "must guard the
 * migration, not follow it". A migration that reduces the backlog while nothing prevents new
 * uncovered files appearing has no way to prove it made progress.
 *
 * WHY IT FAILS ON A DECREASE TOO, WHICH §19.2 DOES NOT REQUIRE. An increase-only check lets a
 * hard-won reduction be quietly given back later: cover ten files, and nothing stops ten new ones
 * reappearing in the same directory. Requiring every change to the baseline to be an explicit,
 * reviewed commit is what "each reduction locked in" actually needs, and it is the same contract
 * `kms:check-generated` already applies to the generated artifacts — a checker this repository
 * already runs and trusts.
 *
 * Slice-local files are excluded via the one shared predicate in repo.ts: they deliberately carry
 * no front-matter and are not debt (U7). Counting them here would put 421 permanent entries in a
 * baseline that is supposed to trend to zero.
 *
 * Usage: tsx kms/scripts/coverage-ratchet.ts [--update]
 */

export const BASELINE_PATH = join(ROOT, "kms", "coverage-baseline.json");

/** Directory key for a repo-relative path. Files at the repo root bucket under ".". */
function bucketFor(rel: string): string {
  const dir = dirname(rel).split("\\").join("/");
  return dir === "." ? "." : dir;
}

/** Uncovered (no front-matter, not slice-local) markdown files, counted per directory. */
export function measureCoverage(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of walk(ROOT)) {
    const rel = relPath(file);
    if (isSliceLocal(rel)) continue;
    if (Object.keys(readFrontMatter(file)).length > 0) continue;
    const bucket = bucketFor(rel);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

/** Sorted on write so the checked-in file is diff-stable across platforms. */
function serialise(counts: Record<string, number>): string {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(counts).sort()) sorted[key] = counts[key];
  const total = Object.values(sorted).reduce((sum, n) => sum + n, 0);
  return `${JSON.stringify({ total, directories: sorted }, null, 2)}\n`;
}

function readBaseline(): Record<string, number> {
  const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as {
    directories: Record<string, number>;
  };
  return parsed.directories;
}

function main() {
  const update = process.argv.includes("--update");
  const measured = measureCoverage();
  const total = Object.values(measured).reduce((sum, n) => sum + n, 0);

  if (update) {
    writeFileSync(BASELINE_PATH, serialise(measured));
    console.log(
      `kms:coverage — baseline updated: ${total} uncovered file(s) across ${Object.keys(measured).length} director(ies)`,
    );
    return;
  }

  const baseline = readBaseline();
  const directories = [...new Set([...Object.keys(baseline), ...Object.keys(measured)])].sort();
  const drift = directories
    .map((dir) => ({ dir, was: baseline[dir] ?? 0, now: measured[dir] ?? 0 }))
    .filter(({ was, now }) => was !== now);

  console.log(
    `kms:coverage — ${total} uncovered file(s) across ${Object.keys(measured).length} director(ies)`,
  );

  if (drift.length === 0) {
    console.log("  baseline matches");
    return;
  }

  for (const { dir, was, now } of drift) {
    const direction = now > was ? "increased" : "decreased";
    console.log(`  ✘ ${dir}: baseline ${was}, measured ${now} (${direction})`);
  }
  console.log(
    "\nUncovered-file counts changed. Add front-matter, or — if the change is intended —",
  );
  console.log("re-baseline with `npm run kms:coverage -- --update` and commit the result.");
  process.exitCode = 1;
}

// Only run when invoked directly, so tests can import measureCoverage without writing files.
if (require.main === module) main();
