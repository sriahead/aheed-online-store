import { FrontMatter, trackFor, TRACK_SITE } from "./frontmatter";
import { ROOT, walk, relPath, normalize, readFrontMatter, isSliceLocal } from "./repo";

/**
 * Walks the repo for markdown files (.md / .mdx), validates any front-matter block
 * against the FrontMatter schema. Files with no front-matter are reported as
 * warnings, not failures — most existing docs haven't been backfilled yet (see
 * requirements.md). Files WITH a front-matter block that fails schema validation
 * are hard failures — EXCEPT front-matter that doesn't even attempt the KMS schema
 * (no `visibility` key, the one required field with no default that nothing else in
 * this repo's own frontmatter conventions uses — Claude Code slash commands use
 * `description:`, Nextra pages use `title:`). Those are a doc that was never opted
 * into this schema, not a broken KMS doc, so they're reported separately, not failed.
 *
 * THE ESCAPE HATCH DOES NOT APPLY UNDER `specs/` OR `docs/` (KMS_OWNED below).
 * Those two trees are KMS-owned: a file there with a front-matter block is always
 * *attempting* this schema, so a missing `visibility` is a broken KMS doc, never an
 * opt-out. Without this carve-out the hatch silently swallows real breakage — all
 * four files of `specs/2026-08-30-global-500-error-boundary/` shipped with
 * `type: plan|requirements|validation|build-notes`, `status: active` and
 * `audience: [frontend]` (none of which are in the enums) and no `visibility`, so
 * every one was filed under "non-KMS … (skipped)" while this script still reported
 * `invalid front-matter (failing): 0`. The slice never reached `ARTIFACT_INDEX.md`
 * and `npm run sdd:audit` only caught it one stage later, after the slice had already
 * merged to `main`. A skip line is not a pass — same lesson as `sdd:audit`'s own
 * promotion-half skip when `gh` is unavailable.
 */
const KMS_OWNED = /^(specs|docs)\//;

function main() {
  const files = walk(ROOT);
  const noFrontMatter: string[] = [];
  const nonKmsFrontMatter: string[] = [];
  const sliceLocal: string[] = [];
  const sliceLocalWithFrontMatter: string[] = [];
  const trackVisibilityMismatch: { file: string; track: string; visibility: string }[] = [];
  const invalid: { file: string; errors: string[] }[] = [];
  let valid = 0;

  for (const file of files) {
    const data = readFrontMatter(file);
    const rel = relPath(file);

    // Slice-local files (requirements/validation/build-notes inside a dated slice directory)
    // deliberately carry no front-matter and get no index entry — see isSliceLocal(). They are
    // their own category, NOT a warning: reporting all 403 of them as "no front-matter" is how a
    // deliberate exclusion came to be read as a 17%-coverage gap (U7, #861).
    //
    // Enforced in both directions. One that DOES carry front-matter fails, because 18 of them
    // had drifted into carrying it while the other 401 had not, and a convention only one file
    // in twenty-three follows is not a convention.
    if (isSliceLocal(rel)) {
      if (Object.keys(data).length > 0) sliceLocalWithFrontMatter.push(rel);
      else sliceLocal.push(rel);
      continue;
    }

    if (Object.keys(data).length === 0) {
      noFrontMatter.push(rel);
      continue;
    }

    if (!("visibility" in data) && !KMS_OWNED.test(rel)) {
      nonKmsFrontMatter.push(rel);
      continue;
    }

    const result = FrontMatter.safeParse(normalize(data));
    if (result.success) {
      valid++;
      // A document whose derived track renders on one site while its `visibility` names the
      // other is assembled NOWHERE — assemble.ts requires both to agree (#861). Before that
      // guard existed the disagreement was worse than invisible: the track alone decided, so
      // docs/operations-research/order-fulfilment-core.md (visibility: internal, audience
      // including shopper) was routed to the PUBLIC site. Failing here is what keeps
      // `visibility` a real control rather than a decorative field.
      const track = trackFor(result.data);
      if (TRACK_SITE[track] !== result.data.visibility) {
        trackVisibilityMismatch.push({
          file: rel,
          track,
          visibility: result.data.visibility,
        });
      }
    } else {
      invalid.push({
        file: rel,
        errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
  }

  console.log(`kms:validate — scanned ${files.length} markdown file(s)`);
  console.log(`  valid front-matter: ${valid}`);
  console.log(`  slice-local, front-matter deliberately absent (expected): ${sliceLocal.length}`);
  console.log(`  no front-matter (warning, not blocking): ${noFrontMatter.length}`);
  if (noFrontMatter.length > 0) {
    for (const f of noFrontMatter) console.log(`    - ${f}`);
  }
  console.log(
    `  non-KMS front-matter, e.g. Claude commands/Nextra pages (skipped): ${nonKmsFrontMatter.length}`,
  );
  if (nonKmsFrontMatter.length > 0) {
    for (const f of nonKmsFrontMatter) console.log(`    - ${f}`);
  }
  console.log(`  invalid front-matter (failing): ${invalid.length}`);
  if (invalid.length > 0) {
    for (const { file, errors } of invalid) {
      console.log(`    ✘ ${file}`);
      for (const e of errors) console.log(`        ${e}`);
    }
    process.exitCode = 1;
  }

  console.log(
    `  slice-local files carrying front-matter (failing): ${sliceLocalWithFrontMatter.length}`,
  );
  if (sliceLocalWithFrontMatter.length > 0) {
    for (const file of sliceLocalWithFrontMatter) {
      console.log(`    ✘ ${file}`);
      console.log(
        "        remove the front-matter block — plan.md carries the slice's only index entry",
      );
    }
    process.exitCode = 1;
  }

  console.log(`  track/visibility disagreement (failing): ${trackVisibilityMismatch.length}`);
  if (trackVisibilityMismatch.length > 0) {
    for (const { file, track, visibility } of trackVisibilityMismatch) {
      console.log(`    ✘ ${file}`);
      console.log(
        `        audience derives track '${track}' (${TRACK_SITE[track as keyof typeof TRACK_SITE]} site) but visibility is '${visibility}' — it would assemble nowhere`,
      );
    }
    process.exitCode = 1;
  }
}

main();
