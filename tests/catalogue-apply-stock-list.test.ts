import { describe, expect, it } from "vitest";
import {
  planProduct,
  unknownCategorySlugs,
  unmappedRows,
  type StockList,
} from "../scripts/catalogue-apply-stock-list";

/** #1523 — the stock-list script's decisions, with no database (R3–R5). */

const hidden = {
  basePrice: 1099,
  restriction: null,
  isActive: false,
  categoryId: "cat-prawns",
  stockMode: "UNKNOWN",
};

describe("planProduct", () => {
  it("activates a priced, unrestricted product, moves it and makes stock untracked", () => {
    expect(planProduct(hidden, "cat-frozen-fish")).toEqual({
      moveCategory: true,
      setUntracked: true,
      activate: true,
      outcome: "activate",
    });
  });

  it("keeps a £0 product hidden as price needed, but still moves it and untracks stock", () => {
    expect(planProduct({ ...hidden, basePrice: 0 }, "cat-frozen-fish")).toEqual({
      moveCategory: true,
      setUntracked: true,
      activate: false,
      outcome: "price needed",
    });
  });

  it("never activates a restricted product", () => {
    const plan = planProduct({ ...hidden, restriction: "AGE_RESTRICTED" }, null);
    expect(plan.activate).toBe(false);
    expect(plan.outcome).toBe("restricted");
    expect(plan.moveCategory).toBe(false);
  });

  it("never deactivates, and a finished product plans no change", () => {
    const done = {
      ...hidden,
      isActive: true,
      categoryId: "cat-frozen-fish",
      stockMode: "UNTRACKED",
    };
    expect(planProduct(done, "cat-frozen-fish")).toEqual({
      moveCategory: false,
      setUntracked: false,
      activate: false,
      outcome: "already active",
    });
    // Even at £0, an already-active product is left as it is.
    expect(planProduct({ ...done, basePrice: 0 }, "cat-frozen-fish").activate).toBe(false);
  });
});

describe("list checks", () => {
  const list: StockList = {
    categoryMap: { "Fish|Frozen Fish": "frozen-fish", "CAKES|CAKE": null, "Veg|Roots": "roots" },
    rows: [
      { sheetName: "Catfish", dept: "Fish", sub: "Frozen Fish", products: ["Catfish"] },
      { sheetName: "ANGEL SLICES 5", dept: "CAKES", sub: "CAKE", plu: "11806" },
      { sheetName: "Yam", dept: "Veg", sub: "Roots", products: ["Yam"] },
      { sheetName: "Odd", dept: "Odd", sub: "Thing", products: ["Odd"] },
    ],
  };

  it("names an unknown target category so the run aborts before writing", () => {
    expect(unknownCategorySlugs(list, new Set(["frozen-fish"]))).toEqual(["roots"]);
    expect(unknownCategorySlugs(list, new Set(["frozen-fish", "roots"]))).toEqual([]);
  });

  it("finds rows whose category pair the map does not cover", () => {
    expect(unmappedRows(list).map((r) => r.sheetName)).toEqual(["Odd"]);
  });
});
