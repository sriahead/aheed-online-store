import { describe, it, expect } from "vitest";
import {
  classifyImportRow,
  newImportedProductState,
  reimportedProductState,
  type DepartmentRestrictionPolicy,
} from "@/lib/catalogue-import-policy";
import { PRODUCT_RESTRICTIONS, type ProductRestriction } from "@/lib/product-restriction";

/**
 * #1211 (R31–R33, ADR-007 Decision 2) — the import contract #1201 writes through. The policy below
 * is a TEST FIXTURE of the first client's departments (#1200's measured list); the platform module
 * holds no department names at all (R30).
 */

const POLICY: DepartmentRestrictionPolicy = {
  byDepartment: {
    TOBACCO: "AGE_RESTRICTED",
    ALCOHOL: "AGE_RESTRICTED",
    "INSTANT LOTTERY": "PROHIBITED",
    "PHONE CARDS": "NOT_DELIVERABLE",
    NEWS: "NOT_DELIVERABLE",
    "E-PAY": "NOT_DELIVERABLE",
    STAMPS: "NOT_DELIVERABLE",
  },
  uncertainDepartments: ["DEFAULT"],
};

const severity = (r: ProductRestriction | null) =>
  r === "PROHIBITED" ? 4 : r === "AGE_RESTRICTED" ? 3 : r === "NOT_DELIVERABLE" ? 2 : r ? 1 : 0;

describe("classifyImportRow (R31)", () => {
  it.each<[string, number, ProductRestriction | null]>([
    [" tobacco ", 999, "AGE_RESTRICTED"],
    ["Tobacco", 999, "AGE_RESTRICTED"],
    ["instant   lottery", 100, "PROHIBITED"],
    ["STAMPS", 85, "NOT_DELIVERABLE"],
    ["DEFAULT", 199, "NEEDS_REVIEW"],
    ["GROCERY", 0, "NEEDS_REVIEW"],
    ["GROCERY", -1, "NEEDS_REVIEW"],
    ["TOBACCO", 0, "AGE_RESTRICTED"],
    ["INSTANT LOTTERY", 0, "PROHIBITED"],
    ["GROCERY", 199, null],
  ])("department %j at %i pence → %s", (department, pricePence, want) => {
    expect(classifyImportRow({ department, pricePence }, POLICY)).toBe(want);
  });

  it("treats a non-finite price as uncertain", () => {
    expect(classifyImportRow({ department: "GROCERY", pricePence: Number.NaN }, POLICY)).toBe(
      "NEEDS_REVIEW",
    );
  });
});

describe("newImportedProductState (R32)", () => {
  it.each([null, ...PRODUCT_RESTRICTIONS])(
    "restriction %s: hidden, stock UNKNOWN, restriction kept",
    (restriction) => {
      expect(newImportedProductState(restriction)).toEqual({
        isActive: false,
        restriction,
        stockMode: "UNKNOWN",
      });
    },
  );
});

describe("reimportedProductState (R33) — full cross product", () => {
  const values: (ProductRestriction | null)[] = [null, ...PRODUCT_RESTRICTIONS];
  const cases: [ProductRestriction | null, boolean, ProductRestriction | null][] = [];
  for (const existing of values)
    for (const isActive of [false, true])
      for (const incoming of values) {
        // An active restricted product cannot exist (DB CHECK); skip only that illegal state.
        if (isActive && existing !== null) continue;
        cases.push([existing, isActive, incoming]);
      }

  it.each(cases)("existing %s (active %s), incoming %s", (existing, isActive, incoming) => {
    const out = reimportedProductState({ isActive, restriction: existing }, incoming);

    // 1. never activates
    if (!isActive) expect(out.isActive).toBe(false);
    // 2. never loosens or clears
    expect(severity(out.restriction)).toBeGreaterThanOrEqual(severity(existing));
    // 3. restricted means hidden
    if (out.restriction !== null) expect(out.isActive).toBe(false);
    // 4. NEEDS_REVIEW is not re-applied over an unrestricted product
    if (existing === null && incoming === "NEEDS_REVIEW") expect(out.restriction).toBeNull();
    // 5. no stock fields, so a re-import cannot write stock
    expect(Object.keys(out).sort()).toEqual(["isActive", "restriction", "tightened"]);
    expect(out).not.toHaveProperty("stockMode");
    expect(out).not.toHaveProperty("quantity");
    // and `tightened` says exactly whether the restriction changed
    expect(out.tightened).toBe(out.restriction !== existing);
  });

  it("hides an active unrestricted product a re-import newly classes as AGE_RESTRICTED", () => {
    expect(reimportedProductState({ isActive: true, restriction: null }, "AGE_RESTRICTED")).toEqual(
      { isActive: false, restriction: "AGE_RESTRICTED", tightened: true },
    );
  });

  it("leaves a reviewed, active, unrestricted product alone on a NEEDS_REVIEW re-import", () => {
    expect(reimportedProductState({ isActive: true, restriction: null }, "NEEDS_REVIEW")).toEqual({
      isActive: true,
      restriction: null,
      tightened: false,
    });
  });
});
