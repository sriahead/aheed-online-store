import { describe, expect, it } from "vitest";
import { slugify } from "../lib/catalogue-form";
import {
  applyPlan,
  type AuditWriteRow,
  type CategoryWriteRow,
  type ImportDb,
  type ImportTx,
  type InventoryWriteRow,
  type ProductWriteRow,
} from "../lib/catalogue-import/apply";
import { isUniqueViolation } from "../lib/catalogue-import/errors";
import {
  buildPlan,
  effectivePolicy,
  listDepartments,
  normaliseVat,
  productSlug,
  unitLabelFor,
  type PlannedProduct,
} from "../lib/catalogue-import/plan";
import { parsePricePence } from "../lib/catalogue-import/price";
import { importProfileSchema, type ImportProfile } from "../lib/catalogue-import/profile";
import {
  buildReport,
  compareVendorCounts,
  exitCodeFor,
  type VendorCounts,
} from "../lib/catalogue-import/report";
import type { SourceRow } from "../lib/catalogue-import/rows";
import { diffSnapshots, type Snapshot } from "../lib/catalogue-import/snapshot";

/**
 * #1216 R11-R17, R20-R25, R27 — the pure planning core and the write path, against stubs. No
 * database and no client data: every department and product below is invented. The stub client
 * models an interactive transaction faithfully enough to prove the property R21 asks for (a failed
 * department leaves nothing behind and does not stop the next one).
 */

const PROFILE: ImportProfile = importProfileSchema.parse({
  columns: { plu: "PLU", name: "Name", price: "Price", department: "Dept", subDepartment: "Sub" },
  unit: { pattern: "\\d+\\s?(?:g|kg|ml|l)\\b", defaultLabel: "each" },
  policy: {
    byDepartment: {
      "RESTRICTED A": "AGE_RESTRICTED",
      "BLOCKED B": "PROHIBITED",
      "UNDELIVERABLE C": "NOT_DELIVERABLE",
    },
    uncertainDepartments: ["CATCH ALL"],
    unrestrictedDepartments: ["FOOD", "DRINK", "TINNED"],
  },
});

let nextRow = 5;
function row(over: Partial<SourceRow> = {}): SourceRow {
  const n = nextRow++;
  return {
    sourceRow: n,
    plu: String(1000 + n),
    name: `PRODUCT ${n}`,
    description: "",
    priceRaw: "£1.00",
    department: "FOOD",
    subDepartment: "",
    vatRaw: "0",
    ...over,
  };
}

describe("parsePricePence (R11)", () => {
  it.each<[string, number]>([
    ["£4.00", 400],
    ["4", 400],
    ["£0.00", 0],
    ["0", 0],
    ["1,234.50", 123450],
    ["£1,234", 123400],
    ["£4.5", 450],
    ["£4.10", 410],
    ["  £0.07 ", 7],
    ["£ 3.20", 320],
  ])("%s is %i pence", (raw, pence) => {
    expect(parsePricePence(raw)).toEqual({ ok: true, pence });
  });

  it.each(["£4.505", "abc", "", "£", "4.", ".5", "1,23.45", "£4,00", "1e3", "£4.00 each"])(
    "%s is BAD_PRICE",
    (raw) => {
      const result = parsePricePence(raw);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.code).toBe("BAD_PRICE");
    },
  );

  it.each(["-1", "-£1.00", "£-2.50"])("%s is NEGATIVE_PRICE", (raw) => {
    const result = parsePricePence(raw);
    expect(!result.ok && result.code).toBe("NEGATIVE_PRICE");
  });

  it("refuses a price too large to be one, rather than overflowing", () => {
    expect(parsePricePence("£12345678901").ok).toBe(false);
  });

  it("is exact where floating point is not: £0.29 is 29, £19.99 is 1999, £1.15 is 115", () => {
    expect(parsePricePence("£0.29")).toEqual({ ok: true, pence: 29 });
    expect(parsePricePence("£19.99")).toEqual({ ok: true, pence: 1999 });
    expect(parsePricePence("£1.15")).toEqual({ ok: true, pence: 115 });
  });
});

describe("rejected rows (R10-R12)", () => {
  it("rejects blank PLU, blank department, blank name and bad prices with distinct codes", () => {
    const plan = buildPlan(
      [
        row({ plu: "" }),
        row({ department: "" }),
        row({ name: "" }),
        row({ priceRaw: "abc" }),
        row({ priceRaw: "-3" }),
        row(),
      ],
      PROFILE,
    );
    expect(plan.rejected.map((r) => r.code)).toEqual([
      "BLANK_PLU",
      "BLANK_DEPARTMENT",
      "BLANK_NAME",
      "BAD_PRICE",
      "NEGATIVE_PRICE",
    ]);
    expect(plan.products).toHaveLength(1);
  });

  it("names every rejected row by its source row number", () => {
    const bad = row({ name: "" });
    const plan = buildPlan([row(), bad], PROFILE);
    expect(plan.rejected).toEqual([
      { sourceRow: bad.sourceRow, code: "BLANK_NAME", reason: expect.any(String) },
    ]);
  });

  it("rejects a name, PLU or department with no letters or digits as BAD_SLUG", () => {
    const plan = buildPlan(
      [row({ name: "+++" }), row({ plu: "--" }), row({ department: "!!!" })],
      PROFILE,
    );
    expect(plan.rejected.map((r) => r.code)).toEqual(["BAD_SLUG", "BAD_SLUG", "BAD_SLUG"]);
  });
});

describe("product identity (R13)", () => {
  it("is the documented function of name, PLU and department only", () => {
    expect(productSlug("Tea Bags 80s", "123", "Food & Drink")).toBe(
      `${slugify("Tea Bags 80s")}-123-${slugify("Food & Drink")}`,
    );
  });

  it("separates a shared PLU across different names and departments", () => {
    const a = row({ plu: "8518", name: "REGAL MARBLE DELUXE MADEIRA", department: "FOOD" });
    const b = row({ plu: "8518", name: "REGAL SPRITS", department: "DRINK" });
    const plan = buildPlan([a, b], PROFILE);
    expect(plan.products.map((p) => p.slug)).toHaveLength(2);
    expect(new Set(plan.products.map((p) => p.slug)).size).toBe(2);
  });

  it("does not depend on row order or on other rows", () => {
    const rows = [row(), row(), row(), row()];
    const forward = buildPlan(rows, PROFILE)
      .products.map((p) => p.slug)
      .sort();
    const backward = buildPlan([...rows].reverse(), PROFILE)
      .products.map((p) => p.slug)
      .sort();
    expect(backward).toEqual(forward);
    const alone = buildPlan([rows[2]], PROFILE).products[0].slug;
    expect(forward).toContain(alone);
  });

  it("rejects a repeated name+PLU+department, naming the first source row", () => {
    const first = row({ plu: "9", name: "SAME" });
    const second = row({ plu: "9", name: "SAME" });
    const plan = buildPlan([first, second], PROFILE);
    expect(plan.products).toHaveLength(1);
    expect(plan.rejected[0]).toMatchObject({ sourceRow: second.sourceRow, code: "DUPLICATE_ROW" });
    expect(plan.rejected[0].reason).toContain(String(first.sourceRow));
  });

  it("truncates a long name to 80 characters before the suffixes", () => {
    const slug = productSlug("a".repeat(200), "7", "FOOD");
    expect(slug.startsWith("a".repeat(80) + "-7-")).toBe(true);
    expect(slug).toBe(`${"a".repeat(80)}-7-food`);
  });
});

describe("categories keep the client's names (R14)", () => {
  it("uses department and sub-department exactly as written, including typos and upper case", () => {
    const plan = buildPlan(
      [
        row({ department: "FOOD", subDepartment: "CIGARETTERS 20S" }),
        row({ department: "DRINK", subDepartment: "DEODERANTS" }),
      ],
      PROFILE,
    );
    expect(plan.categories.map((c) => c.name)).toEqual([
      "FOOD",
      "CIGARETTERS 20S",
      "DRINK",
      "DEODERANTS",
    ]);
  });

  it("builds a department with a child per distinct sub-department, parent first", () => {
    const plan = buildPlan(
      [
        row({ department: "FOOD", subDepartment: "TEA" }),
        row({ department: "FOOD", subDepartment: "COFFEE" }),
      ],
      PROFILE,
    );
    expect(plan.categories).toEqual([
      { slug: "food", name: "FOOD", parentSlug: null, isActive: false },
      { slug: "food-tea", name: "TEA", parentSlug: "food", isActive: false },
      { slug: "food-coffee", name: "COFFEE", parentSlug: "food", isActive: false },
    ]);
  });

  it("gives two departments that share a sub-department name two distinct children", () => {
    const plan = buildPlan(
      [
        row({ department: "FOOD", subDepartment: "MISC" }),
        row({ department: "DRINK", subDepartment: "MISC" }),
      ],
      PROFILE,
    );
    const children = plan.categories.filter((c) => c.parentSlug !== null);
    expect(children.map((c) => c.slug)).toEqual(["food-misc", "drink-misc"]);
    expect(children.every((c) => c.name === "MISC")).toBe(true);
  });

  it("puts a product in its department when the sub-department is blank", () => {
    const plan = buildPlan([row({ department: "FOOD", subDepartment: "" })], PROFILE);
    expect(plan.products[0].categorySlug).toBe("food");
    expect(plan.categories).toHaveLength(1);
  });

  it("makes no child when the sub-department equals its department, and reports it", () => {
    const plan = buildPlan(
      [
        row({ department: "FOOD TO GO", subDepartment: "FOOD TO GO" }),
        row({ department: "food to  go", subDepartment: "Food To Go" }),
      ],
      PROFILE,
    );
    expect(plan.categories.map((c) => c.slug)).toEqual(["food-to-go"]);
    expect(plan.products.every((p) => p.categorySlug === "food-to-go")).toBe(true);
    expect(plan.flattenedSubDepartments).toEqual([
      { department: "FOOD TO GO", subDepartment: "FOOD TO GO", rows: 2 },
    ]);
  });

  it("creates ONE category for names differing only by case, named after the first, and reports every variant", () => {
    const first = row({ department: "FOOD", subDepartment: "Tea" });
    const second = row({ department: "FOOD", subDepartment: "TEA" });
    const third = row({ department: "FOOD", subDepartment: "tea" });
    const plan = buildPlan([first, second, third], PROFILE);
    expect(plan.categories.filter((c) => c.parentSlug)).toHaveLength(1);
    expect(plan.categories[1].name).toBe("Tea");
    expect(plan.categoryNameVariants).toEqual([
      {
        slug: "food-tea",
        chosen: "Tea",
        variants: [
          { name: "TEA", sourceRow: second.sourceRow },
          { name: "tea", sourceRow: third.sourceRow },
        ],
      },
    ]);
  });

  it("reports a department spelled two ways as a variant too", () => {
    const plan = buildPlan([row({ department: "FOOD" }), row({ department: "Food" })], PROFILE);
    expect(plan.categoryNameVariants.map((v) => v.slug)).toEqual(["food"]);
  });

  it("rejects, rather than merges, a slug that would sit at two levels of the tree", () => {
    const plan = buildPlan(
      [row({ department: "A B", subDepartment: "" }), row({ department: "A", subDepartment: "B" })],
      PROFILE,
    );
    expect(plan.rejected.map((r) => r.code)).toEqual(["CATEGORY_CONFLICT"]);
    expect(plan.categories.map((c) => c.slug)).toEqual(["a-b"]);
  });

  it("leaves no category behind for a row it rejects", () => {
    const plan = buildPlan(
      [row({ department: "NEW DEPT", subDepartment: "SUB", priceRaw: "abc" })],
      PROFILE,
    );
    expect(plan.categories).toEqual([]);
  });

  it("creates every category inactive", () => {
    const plan = buildPlan([row({ department: "FOOD", subDepartment: "TEA" })], PROFILE);
    expect(plan.categories.every((c) => c.isActive === false)).toBe(true);
  });

  it("contains no mapping or matching code", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const files = readdirSync("lib/catalogue-import").map((f) => `lib/catalogue-import/${f}`);
    files.push("scripts/import-catalogue.ts");
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /taxonomy|fuzzy|levenshtein|similarity/i,
      );
    }
  });
});

describe("what a planned product carries (R15, R16)", () => {
  const tainted = row({
    department: "FOOD",
    name: "TEA 500g",
    description: "A tea",
  }) as SourceRow & Record<string, unknown>;
  // Cells a source file has but the plan must never carry.
  Object.assign(tainted, {
    barcode: "5000000000000",
    supplier: "ACME",
    cost: "£0.50",
    stock: "-60",
    caseSize: "12",
  });

  it("has exactly the allowed keys and no barcode, supplier, cost, case size, reorder or stock", () => {
    const [product] = buildPlan([tainted], PROFILE).products;
    expect(Object.keys(product).sort()).toEqual(
      [
        "sourceRow",
        "slug",
        "name",
        "description",
        "basePrice",
        "unitLabel",
        "categorySlug",
        "departmentSlug",
        "isActive",
        "restriction",
        "stockMode",
        "plu",
        "sourceDepartment",
      ].sort(),
    );
    expect(JSON.stringify(product)).not.toMatch(/5000000000000|ACME|0\.50|-60/);
  });

  it("takes isActive, restriction and stockMode from the import policy", () => {
    const [product] = buildPlan([row()], PROFILE).products;
    expect(product).toMatchObject({ isActive: false, restriction: null, stockMode: "UNKNOWN" });
  });

  it("uses the mapped description cell, or the empty string", () => {
    expect(buildPlan([row({ description: "A tea" })], PROFILE).products[0].description).toBe(
      "A tea",
    );
    expect(buildPlan([row({ description: "" })], PROFILE).products[0].description).toBe("");
  });

  it("takes the unit token verbatim from the name, else the documented default", () => {
    expect(unitLabelFor("TEA BAGS 500g", PROFILE.unit)).toBe("500g");
    expect(unitLabelFor("TEA BAGS 500 G", PROFILE.unit)).toBe("500 G");
    expect(unitLabelFor("PLAIN TEA", PROFILE.unit)).toBe("each");
  });

  it("never carries net content or a unit-price sort key", () => {
    const [product] = buildPlan([row({ name: "TEA 500g" })], PROFILE).products;
    expect(Object.keys(product).join()).not.toMatch(/netContent|unitPrice/);
  });
});

describe("restrictions (R17)", () => {
  it("classifies from the SOURCE department, not from where the product is filed", () => {
    const plan = buildPlan(
      [
        row({ department: "RESTRICTED A", subDepartment: "SUNDRIES" }),
        row({ department: "BLOCKED B" }),
        row({ department: "UNDELIVERABLE C" }),
        row({ department: "FOOD" }),
      ],
      PROFILE,
    );
    expect(plan.products.map((p) => p.restriction)).toEqual([
      "AGE_RESTRICTED",
      "PROHIBITED",
      "NOT_DELIVERABLE",
      null,
    ]);
    expect(plan.restrictionCounts).toEqual({
      PROHIBITED: 1,
      AGE_RESTRICTED: 1,
      NOT_DELIVERABLE: 1,
      NEEDS_REVIEW: 0,
    });
  });

  it("treats a department in no reviewed list as UNREVIEWED: NEEDS_REVIEW, reported with its row count", () => {
    const plan = buildPlan(
      [
        row({ department: "MYSTERY" }),
        row({ department: "mystery " }),
        row({ department: "FOOD" }),
      ],
      PROFILE,
    );
    expect(plan.unreviewedDepartments).toEqual([{ department: "MYSTERY", rows: 2 }]);
    expect(plan.products.map((p) => p.restriction)).toEqual(["NEEDS_REVIEW", "NEEDS_REVIEW", null]);
  });

  it("lets the same department through once the owner lists it as unrestricted", () => {
    const reviewed = importProfileSchema.parse({
      ...PROFILE,
      policy: {
        ...PROFILE.policy,
        unrestrictedDepartments: [...PROFILE.policy.unrestrictedDepartments, "MYSTERY"],
      },
    });
    const plan = buildPlan([row({ department: "MYSTERY" })], reviewed);
    expect(plan.unreviewedDepartments).toEqual([]);
    expect(plan.products[0].restriction).toBeNull();
  });

  it("classifies a zero price NEEDS_REVIEW but keeps a stricter class", () => {
    const plan = buildPlan(
      [row({ priceRaw: "£0.00" }), row({ department: "RESTRICTED A", priceRaw: "0" })],
      PROFILE,
    );
    expect(plan.products.map((p) => p.restriction)).toEqual(["NEEDS_REVIEW", "AGE_RESTRICTED"]);
  });

  it("an uncertain department imports NEEDS_REVIEW and is not reported as unreviewed", () => {
    const plan = buildPlan([row({ department: "CATCH ALL" })], PROFILE);
    expect(plan.products[0].restriction).toBe("NEEDS_REVIEW");
    expect(plan.unreviewedDepartments).toEqual([]);
  });

  it("effectivePolicy ignores blank departments and case/space differences", () => {
    const { unreviewed } = effectivePolicy(PROFILE.policy, ["", "food", " FOOD ", "NEW"]);
    expect(unreviewed).toEqual(["NEW"]);
  });

  it("listDepartments says how the profile treats each department", () => {
    const listing = listDepartments(
      [
        row({ department: "RESTRICTED A" }),
        row({ department: "FOOD" }),
        row({ department: "FOOD" }),
        row({ department: "CATCH ALL" }),
        row({ department: "ODD" }),
      ],
      PROFILE,
    );
    expect(listing).toEqual([
      { department: "FOOD", rows: 2, treatment: "UNRESTRICTED" },
      { department: "RESTRICTED A", rows: 1, treatment: "AGE_RESTRICTED" },
      { department: "CATCH ALL", rows: 1, treatment: "UNCERTAIN" },
      { department: "ODD", rows: 1, treatment: "UNREVIEWED" },
    ]);
  });
});

describe("VAT is reported, never rewritten (R26)", () => {
  it("counts '20.00' and '20' as one rate and '0' and '0.0' as one", () => {
    expect(normaliseVat("20.00")).toBe("20");
    expect(normaliseVat("20")).toBe("20");
    expect(normaliseVat("0.0")).toBe("0");
    expect(normaliseVat("5")).toBe("5");
    expect(normaliseVat("")).toBe("(blank)");
    expect(normaliseVat("EXEMPT")).toBe("EXEMPT");
  });

  it("summarises rates and lists zero-rated restricted rows", () => {
    const restricted = row({ department: "RESTRICTED A", vatRaw: "0" });
    const plan = buildPlan(
      [row({ vatRaw: "20.00" }), row({ vatRaw: "20" }), row({ vatRaw: "0" }), restricted],
      PROFILE,
    );
    expect(plan.vat.byRate).toEqual({ "20": 2, "0": 2 });
    expect(plan.vat.zeroRatedRestricted).toEqual([
      {
        sourceRow: restricted.sourceRow,
        department: "RESTRICTED A",
        restriction: "AGE_RESTRICTED",
      },
    ]);
  });

  it("writes no VAT field anywhere in a product", () => {
    expect(Object.keys(buildPlan([row({ vatRaw: "20" })], PROFILE).products[0]).join()).not.toMatch(
      /vat/i,
    );
  });
});

describe("isUniqueViolation (R25)", () => {
  it.each([
    [{ code: "23505" }, true],
    [{ code: "P2002" }, true],
    [{ code: "23514" }, false],
    [{ code: "P2003" }, false],
    [{}, false],
    [new Error("duplicate key value violates unique constraint"), false],
    [null, false],
    [undefined, false],
    ["23505", false],
  ])("%j -> %s", (error, expected) => {
    expect(isUniqueViolation(error)).toBe(expected);
  });
});

describe("exit code and report (R20, R26)", () => {
  const base = {
    totals: { rejected: 0, failed: null as number | null },
    categoryNameVariants: [] as unknown[],
  };
  it("is 0 when clean, 2 for rejects or a category variant, 1 for any failed write", () => {
    expect(exitCodeFor(base as never)).toBe(0);
    expect(exitCodeFor({ ...base, totals: { rejected: 3, failed: 0 } } as never)).toBe(2);
    expect(exitCodeFor({ ...base, categoryNameVariants: [{}] } as never)).toBe(2);
    expect(exitCodeFor({ ...base, totals: { rejected: 3, failed: 1 } } as never)).toBe(1);
  });

  it("a dry-run report carries every documented key and null apply counts", () => {
    const plan = buildPlan([row(), row({ priceRaw: "x" })], PROFILE);
    const report = buildReport({
      mode: "dry-run",
      vendor: "v",
      now: new Date("2026-01-01T00:00:00Z"),
      read: { rowsRead: 2, discardedAboveHeader: 3, discardedFooter: 1 },
      plan,
    });
    expect(Object.keys(report)).toEqual(
      expect.arrayContaining([
        "totals",
        "rejected",
        "restrictionCounts",
        "unreviewedDepartments",
        "categoryPlan",
        "flattenedSubDepartments",
        "categoryNameVariants",
        "drift",
        "vat",
        "trace",
      ]),
    );
    expect(report.totals).toMatchObject({
      rowsRead: 2,
      rejected: 1,
      planned: 1,
      created: null,
      failed: null,
    });
    expect(report.totals.rejectedByCode).toEqual({ BAD_PRICE: 1 });
    expect(report.trace).toHaveLength(1);
    expect(report.trace[0].productId).toBeNull();
  });
});

describe("isolation (R27)", () => {
  const counts = (p: number): VendorCounts[string] => ({
    Product: p,
    Category: 1,
    Inventory: p,
    ProductRestrictionAuditLog: 0,
  });
  it("ignores the target vendor and flags any change to another", () => {
    const before: VendorCounts = { target: counts(0), other: counts(5) };
    expect(compareVendorCounts(before, { target: counts(9), other: counts(5) }, "target").ok).toBe(
      true,
    );
    const bad = compareVendorCounts(before, { target: counts(9), other: counts(6) }, "target");
    expect(bad.ok).toBe(false);
    expect(bad.differences).toContainEqual({
      vendorId: "other",
      table: "Product",
      before: 5,
      after: 6,
    });
  });

  it("flags a vendor that appears or vanishes", () => {
    expect(compareVendorCounts({ a: counts(1) }, { a: counts(1), b: counts(1) }, "t").ok).toBe(
      false,
    );
    expect(compareVendorCounts({ a: counts(1) }, {}, "t").ok).toBe(false);
  });

  it("snapshot diffs follow the same rule", () => {
    const snap = (n: number): Snapshot => ({
      takenAt: "x",
      vendors: {
        t: {
          slug: "target",
          counts: {
            Vendor: 1,
            VendorDomain: 1,
            Product: n,
            Category: 0,
            Inventory: 0,
            ProductRestrictionAuditLog: 0,
          },
        },
        o: {
          slug: "other",
          counts: {
            Vendor: 1,
            VendorDomain: 1,
            Product: 5,
            Category: 0,
            Inventory: 0,
            ProductRestrictionAuditLog: 0,
          },
        },
      },
    });
    expect(diffSnapshots(snap(0), snap(50), "target")).toEqual([]);
    const changed = snap(0);
    changed.vendors.o.counts.Product = 6;
    expect(diffSnapshots(snap(0), changed, "target")).toEqual([
      { vendorId: "o", slug: "other", table: "Product", before: 5, after: 6 },
    ]);
  });
});

// ---- the write path, against a stub that models transactions -------------------------------

interface StubState {
  categories: CategoryWriteRow[];
  products: (ProductWriteRow & { id: string })[];
  inventory: InventoryWriteRow[];
  audit: AuditWriteRow[];
  updates: { id: string; restriction: string; isActive: false }[];
}

function stubDb(
  existing: {
    categories?: { id: string; slug: string }[];
    products?: {
      id: string;
      slug: string;
      name: string;
      basePrice: number;
      isActive: boolean;
      restriction: PlannedProduct["restriction"];
    }[];
  } = {},
  failWhen?: (call: { kind: string; rows: { name?: string }[] }) => unknown,
): { db: ImportDb; state: StubState; transactions: { committed: boolean }[] } {
  const state: StubState = { categories: [], products: [], inventory: [], audit: [], updates: [] };
  const transactions: { committed: boolean }[] = [];
  const db: ImportDb = {
    category: { findMany: async () => existing.categories ?? [] },
    product: { findMany: async () => existing.products ?? [] },
    $transaction: async (fn) => {
      const pending: StubState = {
        categories: [],
        products: [],
        inventory: [],
        audit: [],
        updates: [],
      };
      const log = { committed: false };
      transactions.push(log);
      const tx: ImportTx = {
        category: {
          createMany: async ({ data }) => {
            const error = failWhen?.({ kind: "category", rows: data });
            if (error) throw error;
            pending.categories.push(...data);
          },
        },
        product: {
          createMany: async ({ data }) => {
            const error = failWhen?.({ kind: "product", rows: data });
            if (error) throw error;
            pending.products.push(...data);
          },
          update: async ({ where, data }) => {
            pending.updates.push({ id: where.id, ...data });
          },
        },
        inventory: { createMany: async ({ data }) => void pending.inventory.push(...data) },
        productRestrictionAuditLog: {
          createMany: async ({ data }) => void pending.audit.push(...data),
        },
      };
      const result = await fn(tx);
      state.categories.push(...pending.categories);
      state.products.push(...pending.products);
      state.inventory.push(...pending.inventory);
      state.audit.push(...pending.audit);
      state.updates.push(...pending.updates);
      log.committed = true;
      return result;
    },
  };
  return { db, state, transactions };
}

describe("applyPlan (R15, R21-R24)", () => {
  const rows = () => [
    row({ department: "FOOD", subDepartment: "TEA", name: "TEA 80g" }),
    row({ department: "FOOD", subDepartment: "TEA", name: "COFFEE" }),
    row({ department: "RESTRICTED A", subDepartment: "SUNDRIES", name: "ITEM R" }),
    row({ department: "DRINK", subDepartment: "", name: "COLA" }),
  ];

  it("writes only hidden products with UNKNOWN stock, quantity 0, inactive categories, scoped by vendor", async () => {
    const plan = buildPlan(rows(), PROFILE);
    const { db, state } = stubDb();
    const result = await applyPlan(db, "vendor-1", plan);

    expect(result.failedDepartments).toBe(0);
    expect(result.productsCreated).toBe(4);
    expect(state.products.every((p) => p.vendorId === "vendor-1" && p.isActive === false)).toBe(
      true,
    );
    expect(
      state.inventory.every(
        (i) => i.vendorId === "vendor-1" && i.quantity === 0 && i.stockMode === "UNKNOWN",
      ),
    ).toBe(true);
    expect(state.categories.every((c) => c.vendorId === "vendor-1" && c.isActive === false)).toBe(
      true,
    );
    expect(state.inventory).toHaveLength(4);
    expect(Object.keys(state.products[0]).sort()).toEqual(
      [
        "basePrice",
        "categoryId",
        "description",
        "id",
        "isActive",
        "name",
        "restriction",
        "slug",
        "unitLabel",
        "vendorId",
      ].sort(),
    );
    expect(Object.keys(state.inventory[0]).sort()).toEqual(
      ["id", "productId", "quantity", "stockMode", "vendorId"].sort(),
    );
  });

  it("parents are created before children and children point at their parent's id", async () => {
    const { db, state } = stubDb();
    await applyPlan(db, "v", buildPlan(rows(), PROFILE));
    const food = state.categories.find((c) => c.slug === "food")!;
    const tea = state.categories.find((c) => c.slug === "food-tea")!;
    expect(state.categories.indexOf(food)).toBeLessThan(state.categories.indexOf(tea));
    expect(tea.parentId).toBe(food.id);
    expect(food.parentId).toBeNull();
  });

  it("writes exactly one IMPORT audit row per restricted product and none for the rest (R24)", async () => {
    const { db, state } = stubDb();
    await applyPlan(db, "v", buildPlan(rows(), PROFILE));
    const restricted = state.products.filter((p) => p.restriction !== null);
    expect(restricted).toHaveLength(1);
    expect(state.audit).toHaveLength(1);
    expect(state.audit[0]).toMatchObject({
      productId: restricted[0].id,
      action: "RESTRICTION_SET",
      fromRestriction: null,
      toRestriction: "AGE_RESTRICTED",
      actorUserId: null,
      source: "IMPORT",
    });
  });

  it("uses one transaction per top-level department (R21)", async () => {
    const { db, transactions } = stubDb();
    await applyPlan(db, "v", buildPlan(rows(), PROFILE));
    expect(transactions).toHaveLength(3);
  });

  it("rolls back only the failing department, names it, and still runs the rest (R21)", async () => {
    const { db, state } = stubDb({}, ({ kind, rows: data }) =>
      kind === "product" && data.some((r) => r.name === "ITEM R") ? new Error("boom") : null,
    );
    const result = await applyPlan(db, "v", buildPlan(rows(), PROFILE));
    expect(result.failedDepartments).toBe(1);
    expect(result.departments.find((d) => d.status === "FAILED")).toMatchObject({
      department: "RESTRICTED A",
      error: "boom",
    });
    // The failed department left NOTHING behind, including its category...
    expect(state.categories.map((c) => c.slug)).not.toContain("restricted-a");
    expect(state.products.map((p) => p.name)).not.toContain("ITEM R");
    expect(state.audit).toHaveLength(0);
    // ...and the departments before and after it still committed.
    expect(state.products.map((p) => p.name).sort()).toEqual(["COFFEE", "COLA", "TEA 80g"]);
    expect(result.trace.find((t) => t.slug.includes("item-r"))?.productId).toBeNull();
  });

  it("reports a unique violation as ALREADY_EXISTS for that department only (R25)", async () => {
    const { db } = stubDb({}, ({ kind }) =>
      kind === "category" ? Object.assign(new Error("dup"), { code: "P2002" }) : null,
    );
    const result = await applyPlan(db, "v", buildPlan([row({ department: "FOOD" })], PROFILE));
    expect(result.departments[0].status).toBe("ALREADY_EXISTS");
    expect(result.failedDepartments).toBe(1);
  });

  it("a second run over existing rows creates nothing and opens no transaction (R22)", async () => {
    const plan = buildPlan(rows(), PROFILE);
    const first = stubDb();
    await applyPlan(first.db, "v", plan);
    const second = stubDb({
      categories: first.state.categories.map((c) => ({ id: c.id, slug: c.slug })),
      products: first.state.products.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        basePrice: p.basePrice,
        isActive: false,
        restriction: p.restriction,
      })),
    });
    const result = await applyPlan(second.db, "v", plan);
    expect(result.productsCreated).toBe(0);
    expect(result.categoriesCreated).toBe(0);
    expect(result.restrictionTightened).toBe(0);
    expect(result.existingUnchanged).toBe(4);
    expect(second.transactions).toHaveLength(0);
    expect(result.departments.every((d) => d.status === "UNCHANGED")).toBe(true);
  });

  it("never modifies an existing product except to tighten its restriction (R23)", async () => {
    const plan = buildPlan(
      [row({ department: "RESTRICTED A", name: "ITEM R", priceRaw: "£2.00" })],
      PROFILE,
    );
    const slug = plan.products[0].slug;
    const { db, state } = stubDb({
      categories: [{ id: "c1", slug: "restricted-a" }],
      products: [
        { id: "p1", slug, name: "OLD NAME", basePrice: 999, isActive: true, restriction: null },
      ],
    });
    const result = await applyPlan(db, "v", plan);

    expect(state.products).toHaveLength(0); // nothing created
    expect(state.updates).toEqual([{ id: "p1", restriction: "AGE_RESTRICTED", isActive: false }]);
    expect(state.audit).toHaveLength(1);
    expect(state.audit[0]).toMatchObject({
      productId: "p1",
      fromRestriction: null,
      toRestriction: "AGE_RESTRICTED",
      source: "IMPORT",
    });
    expect(state.inventory).toHaveLength(0); // stock never touched
    expect(result.restrictionTightened).toBe(1);
    // A changed name and price are REPORTED as drift, not written.
    expect(result.drift.map((d) => d.field).sort()).toEqual(["basePrice", "name"]);
  });

  it("never activates, never loosens, and does not re-flag a reviewed product (R23)", async () => {
    const plan = buildPlan([row({ department: "CATCH ALL", name: "REVIEWED" })], PROFILE);
    const slug = plan.products[0].slug;
    const { db, state } = stubDb({
      categories: [{ id: "c1", slug: "catch-all" }],
      products: [
        { id: "p1", slug, name: "REVIEWED", basePrice: 100, isActive: true, restriction: null },
      ],
    });
    const result = await applyPlan(db, "v", plan);
    expect(state.updates).toHaveLength(0);
    expect(result.existingUnchanged).toBe(1);
  });

  it("keeps an existing category's id and creates only the missing ones", async () => {
    const { db, state } = stubDb({ categories: [{ id: "existing-food", slug: "food" }] });
    await applyPlan(
      db,
      "v",
      buildPlan([row({ department: "FOOD", subDepartment: "TEA" })], PROFILE),
    );
    expect(state.categories.map((c) => c.slug)).toEqual(["food-tea"]);
    expect(state.categories[0].parentId).toBe("existing-food");
  });
});
