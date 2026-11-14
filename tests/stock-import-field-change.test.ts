import { describe, expect, it } from "vitest";
import { changesFor, decodeValue, planRestore } from "@/lib/stock-import/field-change";

/** #1578 R8 — what an import changed, and what undo may put back. */

describe("field changes", () => {
  const before = {
    name: "LAZIZA HALEEM MASALA 100G",
    basePrice: 269,
    unitLabel: "£2.69",
    netContentAmount: null,
    netContentUnit: null,
    isHalal: false,
  };

  it("records only tracked fields that really change, as text", () => {
    const changes = changesFor(before, {
      name: "Laziza Haleem Masala – 100g",
      basePrice: 279,
      netContentAmount: 100,
      netContentUnit: "GRAM",
      unitLabel: "£2.69",
      isActive: true,
    });
    expect(changes).toEqual([
      {
        field: "name",
        previousValue: "LAZIZA HALEEM MASALA 100G",
        newValue: "Laziza Haleem Masala – 100g",
      },
      { field: "basePrice", previousValue: "269", newValue: "279" },
      { field: "netContentAmount", previousValue: null, newValue: "100" },
      { field: "netContentUnit", previousValue: null, newValue: "GRAM" },
    ]);
  });

  it("decodes each kind back to its type", () => {
    expect(decodeValue("basePrice", "279")).toBe(279);
    expect(decodeValue("netContentAmount", "100")).toBe(100);
    expect(decodeValue("isHalal", "true")).toBe(true);
    expect(decodeValue("name", null)).toBeNull();
  });

  it("restores a field only while it still holds the import's value", () => {
    const changes = changesFor(before, { name: "Laziza Haleem Masala – 100g", basePrice: 279 });
    const untouched = planRestore({ name: "Laziza Haleem Masala – 100g", basePrice: 279 }, changes);
    expect(untouched.data).toEqual({ name: "LAZIZA HALEEM MASALA 100G", basePrice: 269 });
    expect(untouched.kept).toEqual([]);

    const staffChangedPrice = planRestore(
      { name: "Laziza Haleem Masala – 100g", basePrice: 299 },
      changes,
    );
    expect(staffChangedPrice.restored).toEqual(["name"]);
    expect(staffChangedPrice.kept).toEqual(["basePrice"]);
    expect(staffChangedPrice.data).toEqual({ name: "LAZIZA HALEEM MASALA 100G" });
  });

  it("puts an empty field back to empty", () => {
    const changes = changesFor({ netContentAmount: null }, { netContentAmount: 100 });
    expect(planRestore({ netContentAmount: 100 }, changes).data).toEqual({
      netContentAmount: null,
    });
  });
});
