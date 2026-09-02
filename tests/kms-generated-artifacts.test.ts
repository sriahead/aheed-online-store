import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../kms/schema/repo";
import { GENERATED_ARTIFACTS, NEEDS_FOOTER_NORMALISATION } from "../kms/scripts/build-index";

/**
 * `kms/scripts/build-index.ts` writes more than one file, and for a long time only one of
 * them was ever checked for staleness (#537). `GENERATED_ARTIFACTS` is now the single list
 * both `kms:check-generated` and `scripts/sdd-check.ts` derive their coverage from, which
 * makes the list itself the thing worth guarding: dropping an entry silently narrows every
 * check at once, and nothing else in lint/typecheck/build would notice.
 *
 * This is the same shape as `tests/repository-client-injection.test.ts` after #411/#412 —
 * the point is that coverage cannot quietly shrink, not that a particular file is special.
 */
describe("KMS generated artefacts", () => {
  it("lists both files the generator writes", () => {
    expect([...GENERATED_ARTIFACTS].sort()).toEqual(
      ["ARTIFACT_INDEX.md", "app/(admin)/staff/runbook/docs.ts"].sort(),
    );
  });

  it("names only paths that exist on disk", () => {
    for (const path of GENERATED_ARTIFACTS) {
      expect(existsSync(join(ROOT, path)), `${path} is listed but missing`).toBe(true);
    }
  });

  /**
   * Only ARTIFACT_INDEX.md carries a build timestamp and commit SHA. docs.ts is a plain
   * JSON.stringify, so it must be compared exactly — normalising it would widen what a
   * staleness check can miss, which is the defect this slice exists to close.
   */
  it("normalises the footer of the index only", () => {
    expect(NEEDS_FOOTER_NORMALISATION).toEqual(["ARTIFACT_INDEX.md"]);
    for (const path of NEEDS_FOOTER_NORMALISATION) {
      expect(GENERATED_ARTIFACTS).toContain(path);
    }
  });
});
