import { describe, expect, it } from "vitest";
import { formatAttributeNumber, parseAttributeNumber } from "@/lib/attribute-number";

/** #918, R19 — one rule and one format for a NUMBER vendor-filter value. */
describe("formatAttributeNumber", () => {
  it.each([
    ["13.30", "in", "13.3 in"],
    ["15.00", null, "15"],
    ["0.50", "m", "0.5 m"],
    ["100", "W", "100 W"],
    ["65", "W", "65 W"],
  ])("(%s, %s) → %s", (value, unit, expected) => {
    expect(formatAttributeNumber(value, unit)).toBe(expected);
  });
});

describe("parseAttributeNumber", () => {
  it("returns the trimmed string for a valid number", () => {
    expect(parseAttributeNumber(" 13.3 ")).toBe("13.3");
    expect(parseAttributeNumber("0")).toBe("0");
    expect(parseAttributeNumber("99999999.99")).toBe("99999999.99");
  });

  it.each([["abc"], ["-1"], ["1.234"], ["123456789"], [""], ["1e3"]])("refuses %s", (raw) => {
    expect(parseAttributeNumber(raw)).toBeNull();
  });

  it("refuses an array (a repeated URL parameter) and non-strings", () => {
    expect(parseAttributeNumber(["10", "20"])).toBeNull();
    expect(parseAttributeNumber(undefined)).toBeNull();
    expect(parseAttributeNumber(10)).toBeNull();
  });
});
