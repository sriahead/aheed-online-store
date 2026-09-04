import { describe, it, expect } from "vitest";
import {
  MAX_CANDIDATES_PER_LINE,
  distinctTerms,
  parseList,
  parseListLine,
  resolveLines,
  type ListCandidate,
} from "@/lib/shopping-list";
import { sumLinesByProduct } from "@/lib/cart-rules";

// lib/shopping-list.ts is deliberately pure — no lib/db import — so this needs
// no @prisma/client/wasm mocking and no DATABASE_URL.

/** Candidates drawn from the real seeded catalogue (prisma/seed.ts). */
const product = (id: string, name: string, stock = 10): ListCandidate => ({
  id,
  slug: id,
  name,
  unitLabel: "each",
  basePrice: 199,
  stock,
});

const CATALOGUE: ListCandidate[] = [
  product("apples", "Apples"),
  product("bananas", "Bananas"),
  product("whole-milk", "Whole Milk"),
  product("coconut-milk", "Coconut Milk"),
  product("chicken", "Halal Chicken Breast"),
  product("lamb", "Halal Lamb Mince"),
  product("rice", "Basmati Rice 5kg"),
  product("oil", "Sunflower Oil 2L"),
  product("tea", "Mint Tea, box of 40"),
];

describe("parseListLine — quantity forms", () => {
  it("recognises every supported explicit form as 2", () => {
    for (const line of ["2 apples", "2x apples", "2 x apples", "apples x2", "apples x 2"]) {
      expect(parseListLine(line)?.quantity, line).toBe(2);
    }
    expect(parseListLine("2X apples")?.quantity).toBe(2);
  });

  it("defaults to 1 when no quantity is given", () => {
    expect(parseListLine("apples")?.quantity).toBe(1);
  });

  it("returns null for a line with nothing usable", () => {
    expect(parseListLine("")).toBeNull();
    expect(parseListLine("   ")).toBeNull();
    expect(parseListLine(",,,")).toBeNull();
  });
});

describe("parseListLine — a leading integer glued to a unit is a SIZE, not a count", () => {
  it("keeps 5kg as a term and the quantity at 1", () => {
    const parsed = parseListLine("5kg basmati rice");
    expect(parsed?.quantity).toBe(1);
    expect(parsed?.terms).toContain("5kg");
  });

  it("treats a space-separated integer as a count", () => {
    expect(parseListLine("2 apples")?.quantity).toBe(2);
  });

  it("lets an explicit x win while still keeping the size term", () => {
    const parsed = parseListLine("2x 5kg basmati rice");
    expect(parsed?.quantity).toBe(2);
    expect(parsed?.terms).toContain("5kg");
  });

  it("does not read 2L as a count either", () => {
    expect(parseListLine("2L sunflower oil")?.quantity).toBe(1);
  });
});

describe("parseListLine — normalisation and clamping", () => {
  it("lowercases, strips punctuation and drops empty tokens", () => {
    expect(parseListLine("Mint Tea, box of 40")?.terms).toEqual(["mint", "tea", "box", "of", "40"]);
  });

  it("clamps quantity into 1..99", () => {
    expect(parseListLine("1000 apples")?.quantity).toBe(99);
    expect(parseListLine("0 apples")?.quantity).toBe(1);
    expect(parseListLine("99 apples")?.quantity).toBe(99);
  });
});

describe("parseList", () => {
  it("drops blank lines", () => {
    expect(parseList("a\n\n b \n\nc")).toHaveLength(3);
  });

  it("caps a runaway paste at 100 lines", () => {
    expect(parseList(Array(150).fill("apples").join("\n"))).toHaveLength(100);
  });

  it("preserves the original text for the review screen", () => {
    const lines = parseList("2x chicken breast\nmilk");
    expect(lines[0].original).toBe("2x chicken breast");
  });

  it("collects each distinct term once for the single candidate query", () => {
    expect(distinctTerms(parseList("apples\napples\nbananas")).sort()).toEqual([
      "apples",
      "bananas",
    ]);
  });
});

describe("resolveLines", () => {
  const resolve = (text: string, catalogue = CATALOGUE) =>
    resolveLines(parseList(text), catalogue)[0].resolution;

  it("matches on ALL terms, not any term", () => {
    const resolution = resolve("chicken breast");
    expect(resolution.kind).toBe("matched");
    expect(resolution.kind === "matched" && resolution.product.name).toBe("Halal Chicken Breast");
    // "Halal Lamb Mince" shares the term "halal" but has neither of these terms.
  });

  it("reports a term that matches nothing as unmatched, never a near-miss", () => {
    expect(resolve("bannanas").kind).toBe("unmatched");
  });

  it("surfaces a genuinely ambiguous line for the shopper to decide", () => {
    const resolution = resolve("milk");
    expect(resolution.kind).toBe("ambiguous");
    const names =
      resolution.kind === "ambiguous" ? resolution.candidates.map((c) => c.name) : undefined;
    expect(names).toContain("Whole Milk");
    expect(names).toContain("Coconut Milk");
  });

  it("lets an exact name match resolve a line outright", () => {
    const withPlainMilk = [...CATALOGUE, product("milk", "Milk")];
    const resolution = resolve("milk", withPlainMilk);
    expect(resolution.kind).toBe("matched");
    expect(resolution.kind === "matched" && resolution.product.name).toBe("Milk");
  });

  it("falls back to the largest term subset and returns it as ambiguous", () => {
    // "chicken breast 500g" doesn't have an exact match because "500g" isn't in "Halal Chicken Breast".
    // But it shares "chicken" and "breast" with it (score=2).
    const resolution = resolve("chicken breast 500g");
    expect(resolution.kind).toBe("ambiguous");
    const names =
      resolution.kind === "ambiguous" ? resolution.candidates.map((c) => c.name) : undefined;
    expect(names).toContain("Halal Chicken Breast");
  });

  it("is deterministic regardless of candidate order", () => {
    const shuffled = [...CATALOGUE].reverse();
    expect(resolveLines(parseList("milk"), shuffled)).toEqual(
      resolveLines(parseList("milk"), CATALOGUE),
    );
  });

  it("caps an ambiguous line's candidates", () => {
    const many = Array.from({ length: 9 }, (_, i) => product(`milk-${i}`, `Milk Variant ${i}`));
    const resolution = resolveLines(parseList("milk"), many)[0].resolution;
    expect(resolution.kind === "ambiguous" && resolution.candidates).toHaveLength(
      MAX_CANDIDATES_PER_LINE,
    );
  });

  it("resolves the whole reference list as the spec's validation table expects", () => {
    const resolved = resolveLines(
      parseList("2x chicken breast\n5kg basmati rice\nmilk\nbannanas\napples x 3"),
      CATALOGUE,
    );
    expect(resolved.map((line) => line.resolution.kind)).toEqual([
      "matched",
      "matched",
      "ambiguous",
      "unmatched",
      "matched",
    ]);
    expect(resolved.map((line) => line.quantity)).toEqual([2, 1, 1, 1, 3]);
  });
});

/**
 * P2.6 slice 3 (#566, #396) — found live at `/validate`: `matchListTerms` widened its DB query with
 * the approved alias map, but `resolveLines` re-checked each candidate against the shopper's
 * literal, unexpanded word, so a candidate found only via an alias was silently dropped back to
 * "unmatched". Confirmed live under `npm run preview`: `dhania` (alias → `coriander`, approved)
 * resolved via `/search` but not via "Shop your list", against the identical dev catalogue.
 */
describe("resolveLines widens per-line matching through an approved alias (#566)", () => {
  const CORIANDER = product("coriander", "Fresh Coriander 100g");
  const ALIASES = new Map([["dhania", "coriander"]]);

  it("matches a line via its alias's canonical term, not the literal word", () => {
    const resolution = resolveLines(parseList("dhania"), [CORIANDER], ALIASES)[0].resolution;
    expect(resolution.kind).toBe("matched");
    expect(resolution.kind === "matched" && resolution.product.name).toBe("Fresh Coriander 100g");
  });

  it("still resolves to unmatched with no alias map (the pre-#566 behaviour)", () => {
    // Same line, same candidate pool, no third argument — the default empty map must reproduce
    // exactly what shipped before this fix, or every pre-existing caller silently changes.
    expect(resolveLines(parseList("dhania"), [CORIANDER])[0].resolution.kind).toBe("unmatched");
  });

  it("does not let an alias replace the shopper's word for the exact-match check", () => {
    // The candidate's name IS the canonical term, but the shopper typed the alias — so this must
    // resolve via the ordinary all-groups-satisfied path, not the stricter "typed the exact name"
    // one, matching lib/search-ranking.ts's tier-0 rule that an alias never strengthens an exact
    // match. With only one candidate here it still resolves ("matched" either way), so assert the
    // groups/exact distinction directly via a second, textually different candidate.
    const decoy = product("coriander-2", "Ground Coriander 50g");
    const resolution = resolveLines(parseList("dhania"), [CORIANDER, decoy], ALIASES)[0].resolution;
    expect(resolution.kind).toBe("ambiguous");
  });

  it("keeps the alias additive: the shopper's own word still matches directly", () => {
    // #566's central guarantee (R2) — expansion never substitutes. A product matching the LITERAL
    // typed word must still resolve even when that word also happens to have an approved alias.
    const dhaniaLeaf = product("dhania-leaf", "Dhania Leaf Bunch");
    const resolution = resolveLines(parseList("dhania"), [dhaniaLeaf], ALIASES)[0].resolution;
    expect(resolution.kind).toBe("matched");
    expect(resolution.kind === "matched" && resolution.product.name).toBe("Dhania Leaf Bunch");
  });
});

describe("sumLinesByProduct", () => {
  it("collapses a product named twice into one summed entry", () => {
    expect(
      sumLinesByProduct([
        { productId: "apples", quantity: 1 },
        { productId: "apples", quantity: 2 },
      ]),
    ).toEqual([{ productId: "apples", quantity: 3 }]);
  });

  it("leaves distinct products alone, in first-seen order", () => {
    expect(
      sumLinesByProduct([
        { productId: "rice", quantity: 1 },
        { productId: "apples", quantity: 2 },
      ]),
    ).toEqual([
      { productId: "rice", quantity: 1 },
      { productId: "apples", quantity: 2 },
    ]);
  });
});

/**
 * P2.6 slice 4 (#567) — the pack-size rule.
 *
 * `measure` is only ever set by the AI pre-pass in lib/list-normalisation.ts; the deterministic
 * parser cannot tell a measure from a search term, so with AI unavailable none of these lines
 * carry one and this whole rule is inert. That is the intended degradation, and the last test in
 * this block pins it.
 */
describe("resolveLines — a pack size the shop cannot fill exactly is the shopper's choice", () => {
  const ATTA: ListCandidate[] = [
    product("atta-1kg", "Chapati Atta 1kg"),
    product("atta-5kg", "Chapati Atta 5kg"),
    product("atta-10kg", "Chapati Atta 10kg"),
  ];

  it("refuses to resolve 2kg against a shop stocking 1kg, 5kg and 10kg", () => {
    const [line] = resolveLines(
      [{ original: "2kg atta", quantity: 1, terms: ["chapati", "atta"], measure: "2kg" }],
      ATTA,
    );

    expect(line.resolution.kind).toBe("ambiguous");
    if (line.resolution.kind !== "ambiguous") throw new Error("unreachable");
    expect(line.resolution.candidates).toHaveLength(3);
  });

  it("never silently substitutes, even when exactly one product matches the name", () => {
    // The dangerous case: one candidate, so the old code would have called it `matched` and
    // charged the shopper for a 5kg bag they did not ask for.
    const [line] = resolveLines(
      [{ original: "2kg atta", quantity: 1, terms: ["chapati", "atta"], measure: "2kg" }],
      [product("atta-5kg", "Chapati Atta 5kg")],
    );

    expect(line.resolution.kind).toBe("ambiguous");
  });

  it("resolves outright when a product's name carries the measure asked for", () => {
    const [line] = resolveLines(
      [{ original: "5kg basmati rice", quantity: 1, terms: ["basmati", "rice"], measure: "5kg" }],
      CATALOGUE,
    );

    expect(line.resolution.kind).toBe("matched");
    if (line.resolution.kind !== "matched") throw new Error("unreachable");
    expect(line.resolution.product.name).toBe("Basmati Rice 5kg");
  });

  it("matches the measure case-insensitively", () => {
    const [line] = resolveLines(
      [{ original: "5KG basmati rice", quantity: 1, terms: ["basmati", "rice"], measure: "5KG" }],
      CATALOGUE,
    );

    expect(line.resolution.kind).toBe("matched");
  });

  it("is inert when no measure was extracted — today's behaviour, unchanged", () => {
    const withMeasure = resolveLines(
      [{ original: "basmati rice", quantity: 1, terms: ["basmati", "rice"], measure: null }],
      CATALOGUE,
    );
    const without = resolveLines(
      [{ original: "basmati rice", quantity: 1, terms: ["basmati", "rice"] }],
      CATALOGUE,
    );

    expect(withMeasure[0].resolution).toEqual(without[0].resolution);
    expect(without[0].resolution.kind).toBe("matched");
  });
});
