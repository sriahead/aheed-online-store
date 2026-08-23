import { describe, expect, it } from "vitest";
import { checkDestructiveTarget, neonEndpoint } from "@/lib/db-target-guard";

/**
 * Proves R14a (#273, P8.1b) — the guard standing between a destructive
 * maintenance script and the wrong database.
 *
 * This test IS the proof. `validation.md` deliberately asks nobody to run the
 * deletion script against staging to watch it refuse: if the guard were broken,
 * that demonstration would delete staging rows, which is the outcome the guard
 * exists to prevent. So the refusal is established here, with real connection
 * strings shaped exactly like the ones in `secrets/*.vars`.
 *
 * The endpoint ids below are the real ones from this project's Neon branches
 * (they are hostnames, not credentials — every password is a placeholder).
 */

const DEV = "postgresql://u:p@ep-sparkling-paper-za3j7xza.c-2.eu-west-2.aws.neon.tech/neondb";
const DEV_POOLED =
  "postgresql://u:p@ep-sparkling-paper-za3j7xza-pooler.c-2.eu-west-2.aws.neon.tech/neondb";
const STAGING = "postgresql://u:p@ep-empty-scene-zafjzeye.c-2.eu-west-2.aws.neon.tech/neondb";
const STAGING_POOLED =
  "postgresql://u:p@ep-empty-scene-zafjzeye-pooler.c-2.eu-west-2.aws.neon.tech/neondb";
const PRODUCTION = "postgresql://u:p@ep-young-glitter-zadlkttm.c-2.eu-west-2.aws.neon.tech/neondb";

const FORBIDDEN = [
  { label: "the STAGING database", url: STAGING },
  { label: "the PRODUCTION database", url: PRODUCTION },
];

describe("neonEndpoint", () => {
  it("strips the -pooler suffix so both URL forms compare equal", () => {
    expect(neonEndpoint(DEV_POOLED)).toBe(neonEndpoint(DEV));
    expect(neonEndpoint(STAGING_POOLED)).toBe(neonEndpoint(STAGING));
  });

  it("returns null for a string that is not a URL", () => {
    expect(neonEndpoint("not-a-url")).toBeNull();
    expect(neonEndpoint("")).toBeNull();
  });
});

describe("checkDestructiveTarget", () => {
  it("permits the dev branch", () => {
    const verdict = checkDestructiveTarget(DEV, FORBIDDEN);
    expect(verdict.allowed).toBe(true);
  });

  it("refuses the staging host", () => {
    const verdict = checkDestructiveTarget(STAGING, FORBIDDEN);
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason).toContain("STAGING");
  });

  it("refuses the production host", () => {
    const verdict = checkDestructiveTarget(PRODUCTION, FORBIDDEN);
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason).toContain("PRODUCTION");
  });

  it("refuses a POOLED staging URL — the form a guard comparing raw hosts would miss", () => {
    const verdict = checkDestructiveTarget(STAGING_POOLED, FORBIDDEN);
    expect(verdict.allowed).toBe(false);
  });

  it("refuses staging even when only the pooled URL is on the forbidden list", () => {
    const verdict = checkDestructiveTarget(STAGING, [
      { label: "the STAGING database", url: STAGING_POOLED },
    ]);
    expect(verdict.allowed).toBe(false);
  });

  it("fails closed on a missing or unparseable target", () => {
    expect(checkDestructiveTarget(undefined, FORBIDDEN).allowed).toBe(false);
    expect(checkDestructiveTarget("not-a-url", FORBIDDEN).allowed).toBe(false);
  });

  it("does not treat an unset forbidden entry as a wildcard match", () => {
    const verdict = checkDestructiveTarget(DEV, [
      { label: "the STAGING database", url: undefined },
    ]);
    expect(verdict.allowed).toBe(true);
  });
});
