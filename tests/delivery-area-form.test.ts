import { describe, expect, it } from "vitest";
import {
  bulkAddMessage,
  initialDeliveryAreaState,
  parseAreaChargesInput,
  parsePrefixInput,
  parsePrefixListInput,
} from "@/lib/delivery-area-form";

/**
 * P9.2 (#612), R2 and R3; list and range parsing (#613).
 *
 * These assertions are not stylistic input tidying. Delivery-area rows gate checkout, and
 * `lib/delivery.ts` compares each stored value against a shopper's outward code as an area (`MK`)
 * or a district (`MK9`). A stored value of any other shape would silently match nobody, so only
 * those two shapes may be written.
 *
 * `parsePrefixInput` is an allow-list (`^[A-Z]{1,2}([0-9][A-Z0-9]?)?$`), not a symbol deny-list, and
 * these tests are written to match: they assert the accepted shapes and then confirm the allow-list
 * excludes every symbol below, rather than implying the implementation enumerates them. (The list
 * dates from before #402, when the stored value was interpolated into a pattern; it is kept as a
 * broad sample of punctuation an admin could paste.)
 */

/** Punctuation that must never reach a stored delivery-area prefix. */
const METACHARACTERS = ["[", "(", "\\", ".", "*", "+", "?", "^", "$", "{", "|"];

describe("parsePrefixInput normalises a valid postcode area (R2)", () => {
  it.each([
    ["mk", "MK"],
    [" Mk ", "MK"],
    ["MK", "MK"],
    ["rg", "RG"],
    ["w", "W"],
    ["  e  ", "E"],
  ])("maps %j to %j", (input, expected) => {
    const result = parsePrefixInput(input, null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(expected);
  });
});

describe("parsePrefixInput rejects anything that is not a postcode area (R3)", () => {
  it("rejects the empty string, and names the field so the form can point at it", () => {
    const result = parsePrefixInput("", null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("prefix");
  });

  it("rejects whitespace that trims to nothing", () => {
    expect(parsePrefixInput("   ", null).ok).toBe(false);
  });

  it.each(["MKXX", "ABCDE", "1M", "M K"])("rejects %j", (input) => {
    expect(parsePrefixInput(input, null).ok).toBe(false);
  });

  it.each(["M1", "MK9", "EC1A", "W1A"])("accepts district codes %j", (input) => {
    expect(parsePrefixInput(input, null).ok).toBe(true);
  });

  it.each(METACHARACTERS)("rejects the bare metacharacter %j", (char) => {
    expect(parsePrefixInput(char, null).ok).toBe(false);
  });

  it.each(METACHARACTERS)("rejects %j appended to an otherwise valid area", (char) => {
    expect(parsePrefixInput(`MK${char}`, null).ok).toBe(false);
  });

  it("names the prefix field on every rejection, not just the empty one", () => {
    for (const input of ["MKX", "1M", ...METACHARACTERS]) {
      const result = parsePrefixInput(input, null);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.field).toBe("prefix");
    }
  });
});

function listOf(raw: string): string[] {
  const result = parsePrefixListInput(raw, null);
  if (!result.ok)
    throw new Error(`expected success for ${JSON.stringify(raw)}: ${result.error.message}`);
  return result.value;
}

function listError(
  raw: string,
  exampleArea: string | null = null,
): { field: string; message: string } {
  const result = parsePrefixListInput(raw, exampleArea);
  if (result.ok) throw new Error(`expected failure for ${JSON.stringify(raw)}`);
  return result.error;
}

describe("error examples come from the vendor's own area (#905 R27)", () => {
  it("a backwards range names the vendor's example range", () => {
    expect(listError("RG1-RG0", "RG").message).toBe(
      '"RG1-RG0" runs backwards. Put the lower district first, like RG1-RG10.',
    );
  });

  it("an invalid entry names the vendor's area and district", () => {
    expect(listError("RGXX", "RG").message).toContain("(e.g. RG or RG1), or a range like RG1-RG10");
  });

  it.each(["RG1-RG0", "RG1-MK5", "RG1-10", "RGXX"])(
    "with no example area, %j's message has no example clause",
    (input) => {
      const message = listError(input, null).message;
      expect(message).not.toContain("e.g.");
      expect(message).not.toContain("like");
      expect(message).toContain(input);
    },
  );

  it("the single-entry parser follows the same rule", () => {
    const withArea = parsePrefixInput("RG!", "RG");
    const without = parsePrefixInput("RG!", null);
    expect(!withArea.ok && withArea.error.message).toContain("(e.g. RG or RG1)");
    expect(!without.ok && without.error.message).not.toContain("e.g.");
  });
});

describe("parsePrefixListInput — lists (#613 R1-R3)", () => {
  it("names the prefix field on failure (R1)", () => {
    expect(listError("MK1-RG5").field).toBe("prefix");
  });

  it("ignores empty entries (R2)", () => {
    expect(listOf("MK1,,MK2")).toEqual(["MK1", "MK2"]);
    expect(listOf("MK1, MK2,")).toEqual(["MK1", "MK2"]);
  });

  it.each(["", " ", " , "])("asks for an area when nothing is entered: %j (R2)", (input) => {
    expect(listError(input).message).toBe("Enter a postcode area.");
  });

  it("normalises each entry with the single-prefix rule (R3)", () => {
    expect(listOf("mk, rg")).toEqual(["MK", "RG"]);
    expect(listOf("MK")).toEqual(["MK"]);
  });

  it("fails the whole submission on one bad entry, naming it (R3)", () => {
    expect(listError("MK1, M[, MK2").message).toContain("M[");
    expect(listError("MK1, MKXX").message).toContain("MKXX");
  });
});

describe("parsePrefixListInput — ranges (#613 R4-R7)", () => {
  it("expands a range in ascending order (R4)", () => {
    expect(listOf("MK1-MK10")).toEqual(Array.from({ length: 10 }, (_, i) => `MK${i + 1}`));
    expect(listOf("mk1 – mk3")).toEqual(["MK1", "MK2", "MK3"]);
    expect(listOf("MK5-MK5")).toEqual(["MK5"]);
  });

  it.each(["MK1-RG5", "MK10-MK1", "EC1A-EC1C", "MK1-10", "MK1-MK100"])(
    "refuses %j, naming it (R5)",
    (input) => {
      expect(listError(input).message).toContain(input);
    },
  );

  it("de-duplicates, keeping first position (R6)", () => {
    expect(listOf("MK9, MK1-MK10, mk9")).toEqual([
      "MK9",
      "MK1",
      "MK2",
      "MK3",
      "MK4",
      "MK5",
      "MK6",
      "MK7",
      "MK8",
      "MK10",
    ]);
  });

  it("allows exactly 100 values and refuses more (R7)", () => {
    expect(listOf("X0-X99")).toHaveLength(100);
    expect(listError("X0-X99, Y1").message).toContain("100");
  });
});

describe("bulkAddMessage (#613 R11)", () => {
  it.each([
    [10, 0, "Added 10 delivery areas."],
    [7, 3, "Added 7 delivery areas; 3 already listed (their charges were not changed)."],
    [0, 10, "All 10 already listed — nothing changed."],
    [1, 1, "Added 1 delivery area; 1 already listed (their charges were not changed)."],
  ])("added %i, already listed %i", (added, already, expected) => {
    expect(bulkAddMessage(added, already)).toBe(expected);
  });

  it("the initial state carries no message", () => {
    expect(initialDeliveryAreaState.message).toBeNull();
  });
});

describe("parseAreaChargesInput (#890 R25)", () => {
  it("maps blanks to null and amounts to pence", () => {
    const result = parseAreaChargesInput({
      deliveryFee: "5.99",
      minimumOrder: "",
      freeDeliveryThreshold: "0",
    });
    expect(result).toEqual({
      ok: true,
      value: { deliveryFeePence: 599, minimumOrderPence: null, freeDeliveryThresholdPence: 0 },
    });
  });

  it.each([
    [{ deliveryFee: "-1", minimumOrder: "", freeDeliveryThreshold: "" }, "deliveryFeePence"],
    [{ deliveryFee: "", minimumOrder: "abc", freeDeliveryThreshold: "" }, "minimumOrderPence"],
    [
      { deliveryFee: "", minimumOrder: "", freeDeliveryThreshold: "1.234" },
      "freeDeliveryThresholdPence",
    ],
  ])("rejects a malformed amount, naming the field", (raw, field) => {
    const result = parseAreaChargesInput(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe(field);
  });
});
