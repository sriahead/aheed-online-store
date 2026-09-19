import { describe, expect, it } from "vitest";
import {
  defaultListName,
  itemsToLines,
  linesToItems,
  MAX_LIST_NAME_LENGTH,
  MAX_SAVED_LISTS,
  normaliseListName,
  productNamesToLines,
  type SavedListItemRow,
} from "@/lib/saved-list";
import { MAX_LINE_QUANTITY, MAX_LIST_LINES, toTerms, type ParsedLine } from "@/lib/shopping-list";

/**
 * Saved shopping lists — the pure half (P10, #116).
 *
 * The round trip in "survives a round trip unchanged" is the load-bearing test in this file. A
 * saved list re-enters `resolveLines()` as though the shopper had just pasted it, which is what
 * lets saved lists reuse P3d's matching wholesale instead of growing a second copy of it. If the
 * round trip stops being lossless, that reuse is silently wrong rather than loudly broken.
 */

function line(over: Partial<ParsedLine> = {}): ParsedLine {
  return { original: "2x chicken breast", quantity: 2, terms: ["chicken", "breast"], ...over };
}

describe("list name handling", () => {
  it("exposes the caps the UI and repository both depend on", () => {
    expect(MAX_SAVED_LISTS).toBe(20);
    expect(MAX_LIST_NAME_LENGTH).toBe(60);
  });

  it("trims and collapses internal whitespace", () => {
    expect(normaliseListName("  weekly   shop  ")).toBe("weekly shop");
  });

  it("caps a long name at the rendering limit", () => {
    expect(normaliseListName("x".repeat(200))).toHaveLength(MAX_LIST_NAME_LENGTH);
  });

  it("returns null for a name that is empty or only whitespace", () => {
    // Callers branch on null to substitute a default, so "" and "   " must not be different.
    expect(normaliseListName("")).toBeNull();
    expect(normaliseListName("   ")).toBeNull();
  });

  it("builds a default name that is stable for a given clock", () => {
    const now = new Date("2026-09-18T10:00:00Z");

    const first = defaultListName(now);
    const second = defaultListName(now);

    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(MAX_LIST_NAME_LENGTH);
  });
});

describe("linesToItems", () => {
  it("caps a very long list at the paste limit", () => {
    const items = linesToItems(Array.from({ length: 120 }, () => line()));

    expect(items).toHaveLength(MAX_LIST_LINES);
  });

  it("numbers positions densely in array order", () => {
    const items = linesToItems([line(), line(), line()]);

    expect(items.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("joins terms with a single space", () => {
    expect(linesToItems([line()])[0].terms).toBe("chicken breast");
  });

  it("clamps a quantity into the permitted range", () => {
    expect(linesToItems([line({ quantity: 0 })])[0].quantity).toBe(1);
    expect(linesToItems([line({ quantity: 500 })])[0].quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("maps an absent measure or brand to null rather than undefined", () => {
    const item = linesToItems([line()])[0];

    expect(item.measure).toBeNull();
    expect(item.brand).toBeNull();
  });

  it("drops a line with no usable terms, and keeps positions dense after the drop", () => {
    // A row with empty terms could never match anything on re-open, so it would render as a
    // permanently unmatched line the shopper cannot act on.
    const items = linesToItems([line(), line({ terms: [] }), line()]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.position)).toEqual([0, 1]);
  });
});

describe("itemsToLines", () => {
  function row(over: Partial<SavedListItemRow> = {}): SavedListItemRow {
    return {
      rawText: "2x chicken breast",
      terms: "chicken breast",
      quantity: 2,
      measure: null,
      brand: null,
      position: 0,
      ...over,
    };
  }

  it("returns lines in position order even when the rows arrive shuffled", () => {
    const lines = itemsToLines([
      row({ rawText: "third", position: 2 }),
      row({ rawText: "first", position: 0 }),
      row({ rawText: "second", position: 1 }),
    ]);

    expect(lines.map((l) => l.original)).toEqual(["first", "second", "third"]);
  });

  it("drops a row whose stored terms are only whitespace", () => {
    expect(itemsToLines([row({ terms: "   " })])).toEqual([]);
  });
});

describe("the save/load round trip", () => {
  it("survives a round trip unchanged", () => {
    const original: ParsedLine[] = [
      line(),
      line({ original: "5kg basmati rice", quantity: 1, terms: ["basmati", "rice"], measure: "5kg" }), // prettier-ignore
      line({ original: "shan masala", quantity: 3, terms: ["shan", "masala"], brand: "Shan" }),
      line({ original: "milk", quantity: 1, terms: ["milk"], measure: "2L", brand: "Cravendale" }),
      line({ original: "apples", quantity: 6, terms: ["apples"], measure: null, brand: null }),
    ];

    const restored = itemsToLines(linesToItems(original));

    expect(restored).toEqual(
      original.map((l) => ({
        original: l.original,
        quantity: l.quantity,
        terms: l.terms,
        measure: l.measure ?? null,
        brand: l.brand ?? null,
      })),
    );
  });
});

describe("productNamesToLines", () => {
  it("tokenises a catalogue name the same way a pasted line is tokenised", () => {
    // This is what makes the /cart and past-order entry points work without an AI call: a
    // catalogue name re-matches the very product it came from.
    const [built] = productNamesToLines([{ name: "Basmati Rice 5kg", quantity: 2 }]);

    expect(built.original).toBe("Basmati Rice 5kg");
    expect(built.terms).toEqual(toTerms("Basmati Rice 5kg"));
    expect(built.quantity).toBe(2);
    expect(built.measure).toBeNull();
    expect(built.brand).toBeNull();
  });

  it("drops an entry whose name yields no terms", () => {
    expect(productNamesToLines([{ name: "!!!", quantity: 1 }])).toEqual([]);
  });

  it("clamps quantities from the source row", () => {
    expect(productNamesToLines([{ name: "milk", quantity: 0 }])[0].quantity).toBe(1);
  });
});
