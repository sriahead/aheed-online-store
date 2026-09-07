import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GENERATED_ARTIFACTS } from "../kms/scripts/build-index";

/**
 * #649 — an alpha modifier on a themed foreground token silently discards the
 * contrast guarantee the whole theming system is built on.
 *
 * `lib/vendor-theme.ts`'s `brandStyle()` passes every semantic foreground
 * through `clampForContrast`, which raises the value until it clears 4.5:1
 * against white, the vendor's cream and all three tints. A Tailwind alpha
 * modifier then composites that clamped value back over the background at paint
 * time — below the floor again. The perverse part: the better the clamp does its
 * job, the closer a vendor sits to exactly 4.5:1, and the further `/70` drops.
 *
 * NOTHING ELSE CAN SEE THIS. `tests/design-tokens-contrast.test.ts` reads token
 * VALUES, and the alpha is applied by the browser, not by the token.
 * `eslint-plugin-jsx-a11y` ships no contrast rule. `specs/design-system.md` had
 * forbidden it in prose since the file was written and it still reached **299
 * occurrences across 83 files** — including `labelClass`, which was duplicated
 * verbatim in 15 files and made every form label in the application fail at
 * once. Prose is not a control; this file is.
 *
 * WHAT IS DELIBERATELY *NOT* BANNED:
 *
 *  - **Background, border and ring alpha** (`bg-primary/10`, `border-primary/20`,
 *    `ring-primary/20`). Those are surfaces and decorative boundaries, not text.
 *    `#641` tracks one open question about a hover tint; it is not this rule's.
 *  - **`text-black/60` and above.** `black` is not a themed token — no vendor
 *    varies it, so no clamp is involved and nothing is being discarded. 5.74:1 is
 *    verified once rather than per vendor. `text-black/50` and below ARE banned:
 *    `/50` measures 3.98:1 and `/40` about 3.0:1.
 *
 * Directories are walked from the filesystem rather than listed, so a new file is
 * covered the moment it exists — same reasoning as
 * `tests/panel-token-purity.test.ts` and `tests/repository-client-injection.test.ts`.
 */

const ROOTS = ["app", "components", "features"];

/**
 * `text-primary/70`, `placeholder:text-primary/30`, `fill-action/50`.
 * Foreground positions only — `text`, `fill`, `stroke`, `decoration`.
 * `[a-z-]*` catches the suffixed forms (`-tint`, `-hover`, `-muted`, `-subtle`)
 * so nobody can reintroduce the defect one layer along.
 */
const THEMED_FOREGROUND_ALPHA =
  /(text|fill|stroke|decoration)-(primary|action|accent|danger)[a-z-]*\/[0-9]+/g;

/** `text-black/10` through `/50` — below 4.5:1 on white. */
const DIM_BLACK_TEXT = /text-black\/[1-5]0/g;

/**
 * GENERATED files are excluded, derived from `build-index.ts`'s own constant
 * rather than named here — CLAUDE.md is explicit that enumerating the generated
 * artefacts by hand is how one of them silently stopped being checked.
 * `app/(admin)/staff/runbook/docs.ts` sits inside a scanned root and embeds every
 * KMS document's full BODY, so it legitimately quotes these class names out of
 * spec prose (this very file's rationale among them).
 */
const GENERATED = new Set<string>(GENERATED_ARTIFACTS.map((p) => p.replace(/\\/g, "/")));

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (entry.endsWith(".tsx")) found.push(full);
  }
  return found;
}

function scannedFiles(): string[] {
  return ROOTS.flatMap(walk)
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => !GENERATED.has(p));
}

describe("token alpha purity (#649)", () => {
  const files = scannedFiles();

  it("scans a plausible number of files, so the suite cannot pass vacuously", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no alpha modifier on a themed foreground token", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const matches = readFileSync(file, "utf8").match(THEMED_FOREGROUND_ALPHA);
      if (matches) offenders.push(`${file}: ${[...new Set(matches)].join(", ")}`);
    }
    expect(
      offenders,
      "Use text-primary-muted (text, 4.5:1) or text-primary-subtle (aria-hidden graphics, 3:1). " +
        "An alpha modifier composites brandStyle()'s clamped value back below the contrast floor.",
    ).toEqual([]);
  });

  it("has no black text dimmer than 60%", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const matches = readFileSync(file, "utf8").match(DIM_BLACK_TEXT);
      if (matches) offenders.push(`${file}: ${[...new Set(matches)].join(", ")}`);
    }
    expect(
      offenders,
      "text-black/50 is 3.98:1 and /40 about 3.0:1. Use text-black/60 (5.74:1).",
    ).toEqual([]);
  });
});
