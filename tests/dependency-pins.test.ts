import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Proves #491 — the infrastructure-adjacent packages named in CLAUDE.md are
 * exact-pinned, and the versions installed are the versions documented.
 *
 * WHY THIS TEST EXISTS AT ALL
 *
 * CLAUDE.md's dependency-discipline rule says to exact-pin DB drivers and
 * adapters, because "their declared semver ranges are looser than real
 * compatibility". Nothing enforced it, and on 2026-08-14 commit `ac3f0d6`
 * (the Cloudflare connection-exhaustion fix that introduced lib/db.ts's
 * hybrid getPrisma/getPrismaWs strategy) deliberately raised two of them:
 *
 *   @neondatabase/serverless  0.10.4  -> ^1.1.0
 *   @prisma/adapter-neon      ^6.19.3 -> ^7.9.1
 *
 * That commit updated CLAUDE.md's hybrid-driver section but not its pin
 * paragraph, so for roughly three weeks the file that gets read every session
 * described a dependency state that no longer existed — and, because both
 * became CARET ranges, a future `npm install` could move them again silently.
 * The drift was found by hand at #489's /spec, not by any check.
 *
 * WHY A DOC FIX ALONE WAS NOT ENOUGH
 *
 * @prisma/adapter-neon@7.9.1 declares NO peerDependencies whatsoever. It takes
 * @prisma/driver-adapter-utils at an exact 7.9.1 as a direct dependency and
 * @neondatabase/serverless at ">0.6.0 <2". So npm has nothing to check the
 * @prisma/client version against, and never will: the fact that a 7.x adapter
 * is running against a 6.19.3 client is invisible to the toolchain BY
 * CONSTRUCTION, not by oversight. That straddle is deliberate and ratified
 * (#560 tracks closing it), but "deliberate" is only meaningful if it cannot
 * change without someone noticing — which is this test's job.
 *
 * WHAT THIS CHECKS, AND WHY THIS SHAPE
 *
 * Two independent properties, because they fail independently:
 *
 *   1. The INSTALLED version equals the documented pin. Catches a lockfile
 *      that has moved, or a local install that diverged from CI.
 *   2. The DECLARED specifier in package.json carries no range operator.
 *      Catches a re-loosened pin whose resolved version happens to still match
 *      today — the state this repo was actually in, where `^1.1.0` resolved to
 *      1.1.0 and so looked correct from the lockfile alone.
 *
 * Checking only (1) would have passed throughout the three weeks of drift.
 *
 * The version literals below are the single source of truth this file asserts
 * against; CLAUDE.md's dependency section quotes the same numbers in prose.
 * When a pin is deliberately changed, both move together in the same commit —
 * that is the whole point, and #491 exists because they did not.
 *
 * NOT COVERED HERE, DELIBERATELY
 *
 * - `prisma` (the CLI/generator) is still declared `^6.19.3`. Out of scope for
 *   #491, which named the three DB runtime packages; noted in that slice's
 *   build notes as a follow-up candidate, since a floating generator against a
 *   pinned client is an asymmetry this slice introduces.
 * - `@cloudflare/workers-types` is types-only, on date-based versioning, and
 *   ships no runtime behaviour. CLAUDE.md records its observed pairing with
 *   wrangler rather than asserting a rule this test would enforce.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The exact versions CLAUDE.md's dependency-discipline section documents.
 * Changing a value here without changing it there (and vice versa) is the
 * drift this test exists to make loud.
 */
const PINNED: Record<string, string> = {
  "@neondatabase/serverless": "1.1.0",
  "@prisma/adapter-neon": "7.9.1",
  "@prisma/client": "6.19.3",
};

/** Anything that lets npm resolve to something other than the literal. */
const RANGE_OPERATORS = ["^", "~", ">", "<", "=", "*", "x", "|", " - "];

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

const packageJson = readJson(join(REPO_ROOT, "package.json"));
const declaredDependencies = {
  ...((packageJson.dependencies as Record<string, string>) ?? {}),
  ...((packageJson.devDependencies as Record<string, string>) ?? {}),
};

describe("dependency pins (#491)", () => {
  describe("installed version matches the documented pin", () => {
    for (const [name, expected] of Object.entries(PINNED)) {
      it(`${name} is installed at exactly ${expected}`, () => {
        const installed = readJson(
          join(REPO_ROOT, "node_modules", ...name.split("/"), "package.json"),
        ).version;

        expect(
          installed,
          `${name} is installed at ${String(installed)} but CLAUDE.md and this test document ${expected}. ` +
            `Either the lockfile moved, or a pin was changed without updating CLAUDE.md and PINNED here.`,
        ).toBe(expected);
      });
    }
  });

  describe("package.json declares the pin with no range operator", () => {
    for (const [name, expected] of Object.entries(PINNED)) {
      it(`${name} is declared as a bare "${expected}"`, () => {
        const declared = declaredDependencies[name];

        expect(declared, `${name} is not declared in package.json at all`).toBeDefined();

        const offending = RANGE_OPERATORS.filter((operator) => declared.includes(operator));
        expect(
          offending,
          `${name} is declared as "${declared}", which carries the range operator(s) ` +
            `${offending.join(", ")}. CLAUDE.md requires infrastructure-adjacent packages to be ` +
            `exact-pinned, so npm cannot move them on the next install — a caret here resolves to ` +
            `the right version today and silently stops doing so later, which is exactly how #491 happened.`,
        ).toEqual([]);

        expect(declared).toBe(expected);
      });
    }
  });
});
