import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GENERATED_ARTIFACTS } from "../kms/scripts/build-index";

/**
 * #651 — `app/globals.css`'s reduced-motion block is CLASS-SCOPED, and a
 * transform written as a Tailwind utility is outside it.
 *
 * The block resets `.skew-card`, `.skew-card-inner`, `.skew-card-badge` and
 * `.skew-card-price` by name. `components/product/ProductCard.tsx` renders the
 * product photo with `transition-transform duration-500 group-hover:scale-105`,
 * which is in none of those classes — and `transform` is not an inherited
 * property, so `transform: none` on the ancestor does nothing for it. Under
 * `prefers-reduced-motion: reduce` the card correctly stopped skewing and
 * lifting, and still ran a 500ms image zoom. That shipped and survived a full
 * milestone inside the one component whose motion contract is most carefully
 * documented.
 *
 * WHY THIS IS A TEST RATHER THAN A WIDER CSS RULE. Widening the block to a
 * global selector was considered and rejected: a blanket `transition-duration`
 * override also removes the `box-shadow`/`border-color` transitions the block
 * deliberately KEEPS (so hover stops being perceivable at all), and a blanket
 * `transform: none` breaks the seven STATIC `-translate-y-1/2` centring
 * transforms in this repo — search icons detach from their inputs, carousel
 * controls mis-position — for reduced-motion users only. The per-site
 * `motion-reduce:` variant is correct; its weakness is that a new component can
 * forget it, which is exactly what a filesystem-walking test is for.
 *
 * `animate-spin` is NOT covered. Those three are pending indicators on submit
 * controls: short-lived, essential feedback, and removing them under reduced
 * motion would remove information rather than discomfort.
 */

const ROOTS = ["app", "components", "features"];

/** `active:scale-95`, `group-hover:scale-105`, `hover:scale-110`, `focus:scale-105`. */
const INTERACTION_SCALE = /\b(active|hover|group-hover|focus):scale-\d+/g;

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

/**
 * Checked per LINE, not per file. A file can legitimately hold several elements,
 * only some of which animate — asking "does this file mention motion-reduce
 * anywhere" would pass a file whose second scaling element forgot it.
 */
function uncoveredLines(file: string): string[] {
  const bad: string[] = [];
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    INTERACTION_SCALE.lastIndex = 0;
    if (!INTERACTION_SCALE.test(line)) return;
    if (line.includes("motion-reduce:")) return;
    bad.push(`${file}:${i + 1}  ${line.trim().slice(0, 100)}`);
  });
  return bad;
}

describe("reduced-motion coverage (#651)", () => {
  const files = ROOTS.flatMap(walk)
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => !GENERATED.has(p));

  it("finds the interaction-scale sites it exists to guard", () => {
    const withScale = files.filter((f) => {
      INTERACTION_SCALE.lastIndex = 0;
      return INTERACTION_SCALE.test(readFileSync(f, "utf8"));
    });
    // Guards against a regex that silently stops matching: if this drops to
    // zero the suite would pass while checking nothing at all.
    expect(withScale.length).toBeGreaterThan(10);
  });

  it("gives every interaction-scale element a motion-reduce variant", () => {
    const offenders = files.flatMap(uncoveredLines);
    expect(
      offenders,
      "Add a motion-reduce: variant cancelling the transform on the same element, " +
        "e.g. `active:scale-95 motion-reduce:active:scale-100`. globals.css's " +
        "reduced-motion block is class-scoped and cannot reach a utility transform.",
    ).toEqual([]);
  });

  it("keeps the product card's image zoom covered — the defect that motivated this", () => {
    const card = readFileSync("components/product/ProductCard.tsx", "utf8");
    expect(card).toContain("group-hover:scale-105");
    expect(card).toContain("motion-reduce:group-hover:scale-100");
  });
});
