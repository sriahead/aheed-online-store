import { describe, expect, it } from "vitest";
import { confirmDeleteLabel, parseAttributeName, parseSortOrder } from "@/lib/attribute-form";

/** #912, R8 — field rules for vendor-defined filters and their values. */
describe("parseAttributeName", () => {
  it("accepts a name and derives its slug", () => {
    expect(parseAttributeName("  Screen Size ")).toEqual({
      ok: true,
      value: { name: "Screen Size", slug: "screen-size" },
    });
  });

  it("(a) refuses an empty name", () => {
    expect(parseAttributeName("   ")).toEqual({ ok: false, field: "name", error: "Enter a name." });
  });

  it("(b) refuses a name over 40 characters, counted after trimming", () => {
    expect(parseAttributeName(` ${"a".repeat(40)} `).ok).toBe(true);
    expect(parseAttributeName("a".repeat(41))).toEqual({
      ok: false,
      field: "name",
      error: "Keep the name to 40 characters or fewer.",
    });
  });

  it("(c) refuses a name with no letter or number", () => {
    expect(parseAttributeName("!!!")).toEqual({
      ok: false,
      field: "name",
      error: "Use at least one letter or number.",
    });
  });
});

describe("parseSortOrder (h)", () => {
  it("accepts whole numbers from 0 to 999", () => {
    expect(parseSortOrder("0")).toEqual({ ok: true, value: 0 });
    expect(parseSortOrder(" 999 ")).toEqual({ ok: true, value: 999 });
  });

  it.each(["", "-1", "1000", "2.5", "abc"])("refuses %j", (raw) => {
    expect(parseSortOrder(raw)).toEqual({
      ok: false,
      field: "sortOrder",
      error: "Enter a position from 0 to 999.",
    });
  });
});

describe("confirmDeleteLabel (R10)", () => {
  it("is singular for one product and plural otherwise", () => {
    expect(confirmDeleteLabel(1)).toBe("Also remove it from 1 product");
    expect(confirmDeleteLabel(3)).toBe("Also remove it from 3 products");
  });
});
