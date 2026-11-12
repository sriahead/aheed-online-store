import { describe, expect, it } from "vitest";
import { multiBuyLabel, savingLabel } from "@/lib/price-psychology";

describe("savingLabel (#1523)", () => {
  it("states the saving in money and a percentage", () => {
    expect(savingLabel(500, 400)).toBe("Save £1.00 (20%)");
  });

  it("rounds the percentage down, never overstating it", () => {
    expect(savingLabel(300, 200)).toBe("Save £1.00 (33%)");
  });

  it("drops a percentage that rounds to 0", () => {
    expect(savingLabel(100000, 99999)).toBe("Save £0.01");
  });

  it("returns null when there is no markdown", () => {
    expect(savingLabel(400, 400)).toBeNull();
    expect(savingLabel(300, 400)).toBeNull();
    expect(savingLabel(null, 400)).toBeNull();
  });
});

describe("multiBuyLabel (#1523)", () => {
  const tier = { groupQuantity: 4, groupPricePence: 1800, isActive: true };

  it("states the group price and what one group saves", () => {
    expect(multiBuyLabel(500, tier)).toBe("4 for £18.00 · save £2.00");
  });

  it("omits the saving when the group costs the same as base price", () => {
    expect(multiBuyLabel(450, tier)).toBe("4 for £18.00");
  });

  it("never states a saving for a group dearer than base (the cart clamps it)", () => {
    expect(multiBuyLabel(400, tier)).toBe("4 for £18.00");
  });

  it("returns null for an inactive, missing or malformed tier", () => {
    expect(multiBuyLabel(500, null)).toBeNull();
    expect(multiBuyLabel(500, { ...tier, isActive: false })).toBeNull();
    expect(multiBuyLabel(500, { ...tier, groupQuantity: 1 })).toBeNull();
  });
});
