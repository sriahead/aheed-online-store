import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GENERATED_ARTIFACTS } from "../kms/scripts/build-index";

/**
 * #631 — Aheed's brand hexes were hardcoded into shared staff-panel pages, so a
 * SriMart staff member saw Aheed's green on their own store's screens.
 *
 * Nothing caught it, and the reason is worth stating: these are Tailwind
 * ARBITRARY VALUES (`text-[#2e7d32]`), which are ordinary string literals as far
 * as `lint` and `format:check` are concerned, and no test renders a second
 * vendor's admin output. `components/staff/ProductForm.tsx` states the rule this
 * broke, in the panel's own code: "Colours are semantic tokens per
 * design-system.md, never raw hex."
 *
 * Scope is the staff panel — `app/(admin)/` and `components/staff/`. It
 * deliberately does NOT cover `components/product/`, where `#512` tracks the
 * same class on the storefront side; a test that failed on a file this slice is
 * not fixing would have to be introduced already-failing.
 *
 * Directories are walked from the filesystem rather than listed, so a new panel
 * file is covered the moment it exists — the same reasoning as
 * `tests/operator-doc-coverage.test.ts` and `tests/repository-client-injection.test.ts`.
 */

const ROOTS = ["app/(admin)", "components/staff"];

/** `bg-[#f5f5f0]`, `text-[#2e7d32]`, `hover:bg-[#c8e6c9]` — 3, 4, 6 or 8 digit hex. */
const ARBITRARY_HEX = /\[#[0-9a-fA-F]{3,8}\]/g;

/**
 * GENERATED files are excluded, derived from `build-index.ts`'s own constant
 * rather than named here — `CLAUDE.md` is explicit that enumerating the
 * generated artefacts by hand is how one of them silently stopped being
 * checked. `app/(admin)/staff/runbook/docs.ts` sits inside a scanned root and
 * embeds every KMS document's full BODY, so it legitimately contains hex
 * strings quoted from spec prose. They are not Tailwind classes and rewriting
 * them would be undone by the next `npm run kms:build-index`.
 */
const GENERATED = new Set<string>(GENERATED_ARTIFACTS.map((p) => p.replace(/\\/g, "/")));

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      if (GENERATED.has(full.replace(/\\/g, "/"))) continue;
      found.push(full);
    }
  }
  return found;
}

describe("staff panel uses semantic colour tokens, never raw hex (#631)", () => {
  const files = ROOTS.flatMap(walk);

  it("finds panel files to check", () => {
    // Guards against the walk silently matching nothing, which would make every
    // assertion below vacuously true.
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s contains no Tailwind arbitrary hex colour", (file) => {
    const matches = readFileSync(file, "utf8").match(ARBITRARY_HEX);

    expect(
      matches,
      matches
        ? `${file} hardcodes ${matches.join(", ")}. Use a semantic token ` +
            `(text-action, bg-action-tint, bg-surface-muted, text-danger) so the ` +
            `colour follows the viewing vendor's brand — brandStyle() re-declares ` +
            `all of them per vendor.`
        : undefined,
    ).toBeNull();
  });
});
