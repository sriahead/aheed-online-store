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
