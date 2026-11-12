import { describe, it, expect } from "vitest";
import { blockReason, bundleQualifies } from "@/scripts/catalogue-activate-offers";

describe("#1519 offer activation rules", () => {
  it("never switches on a restricted or £0 offer product", () => {
    expect(blockReason({ id: "a", name: "A", basePrice: 500, restriction: null })).toBeNull();
    expect(blockReason({ id: "b", name: "B", basePrice: 500, restriction: "NEEDS_REVIEW" })).toBe(
      "restricted (NEEDS_REVIEW)",
    );
    expect(blockReason({ id: "c", name: "C", basePrice: 0, restriction: null })).toBe(
      "price is £0",
    );
  });

  it("switches a bundle on only when every product in it is switched on", () => {
    const on = new Set(["a", "b"]);
    expect(bundleQualifies(["a", "b"], on)).toBe(true);
    expect(bundleQualifies(["a", "x"], on)).toBe(false);
    expect(bundleQualifies([], on)).toBe(false);
  });
});
