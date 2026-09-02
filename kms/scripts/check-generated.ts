/**
 * Are the generated KMS artefacts current? (#537)
 *
 *   npm run kms:check-generated
 *
 * Snapshots every path in `GENERATED_ARTIFACTS`, rebuilds, and compares. Exits 0 when all
 * are current, non-zero when any has drifted — naming every drifted path, not just the
 * first, so one run says everything that is stale.
 *
 * WHY THIS IS ONE SCRIPT AND NOT A STEP IN EACH CALLER
 *
 * The defect this closes was a generator with two outputs and one watcher: `gates.yml` and
 * `scripts/sdd-check.ts` each rebuilt and diffed ARTIFACT_INDEX.md alone, so a
 * content-only documentation edit left `app/(admin)/staff/runbook/docs.ts` stale on
 * `staging` and `main` with every check green. Adding the second path to both callers
 * would have fixed today's symptom and rebuilt the cause — two lists that must be
 * remembered together. The file list lives with the generator that writes it, and both
 * callers run this.
 *
 * WHY IT RESTORES WHAT IT REBUILDS
 *
 * The rebuild rewrites ARTIFACT_INDEX.md's footer with a fresh timestamp and commit SHA on
 * every run, so a plain rebuild always dirties the working tree even when nothing has
 * actually drifted. `sdd:preclear` then has to distinguish that noise from real uncommitted
 * work for its clean-tree check. So a file whose only difference is normalised away is
 * restored to its original bytes, and a file that genuinely drifted is left regenerated —
 * leaving it is the fix, since the instruction is "commit the result".
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../schema/repo";
import { GENERATED_ARTIFACTS, NEEDS_FOOTER_NORMALISATION } from "./build-index";

/**
 * Normalises away the generated timestamp/commit footer, and line endings.
 *
 * The line-ending half is not incidental: a Windows checkout can hold `\r\n` on disk while
 * the generator always writes `\n` (Node's default), which git treats as identical but a
 * string compare does not — every line would register as different. Moved here from
 * `scripts/sdd-check.ts`, which carried the same reasoning.
 */
function normalise(content: string, path: string): string {
  const eol = content.replace(/\r\n/g, "\n");
  if (!NEEDS_FOOTER_NORMALISATION.includes(path)) return eol;
  return eol
    .replace(/Last build: `[^`]+`/, "Last build: TS")
    .replace(/commit `[^`]+`/, "commit SHA");
}

export type ArtefactResult = { path: string; drifted: boolean };

/**
 * Rebuilds and compares every generated artefact. Returns one result per path, in
 * `GENERATED_ARTIFACTS` order. Exported so a caller can report in its own voice rather
 * than parsing stdout.
 */
export function checkGeneratedArtefacts(): ArtefactResult[] {
  const before = new Map<string, string>();
  for (const path of GENERATED_ARTIFACTS) {
    before.set(path, readFileSync(join(ROOT, path), "utf8"));
  }

  execFileSync("npx", ["tsx", join(ROOT, "kms/scripts/build-index.ts")], {
    cwd: ROOT,
    stdio: "ignore",
    shell: process.platform === "win32",
  });

  return GENERATED_ARTIFACTS.map((path) => {
    const original = before.get(path) as string;
    const rebuilt = readFileSync(join(ROOT, path), "utf8");
    const drifted = normalise(original, path) !== normalise(rebuilt, path);
    // Restore when the only difference is normalised away, so a footer-only rebuild does
    // not masquerade as uncommitted work. Real drift stays on disk as the fix.
    if (!drifted && original !== rebuilt) writeFileSync(join(ROOT, path), original);
    return { path, drifted };
  });
}

function main(): void {
  const results = checkGeneratedArtefacts();

  for (const { path, drifted } of results) {
    if (drifted) {
      console.error(
        `::error::${path} is stale — run 'npm run kms:build-index' and commit the result.`,
      );
    } else {
      console.log(`  ✓ ${path} is current`);
    }
  }

  const stale = results.filter((r) => r.drifted);
  if (stale.length > 0) {
    console.error(
      `\ncheck-generated — ${stale.length} of ${results.length} generated artefact(s) stale.`,
    );
    process.exit(1);
  }
  console.log(`check-generated — all ${results.length} generated artefact(s) current ✓`);
}

if (require.main === module) main();
