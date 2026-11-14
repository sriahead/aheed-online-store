import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIndex, matchRow, wordContext, type CatalogueProduct } from "@/lib/stock-import/match";
import { computeChanges } from "@/lib/stock-import/merge";
import { normaliseFile, parseMultiBuy, splitForms } from "@/lib/stock-import/normalise";
import { buildPlan, countPlan } from "@/lib/stock-import/plan";
import {
  applyPresets,
  parseProfile,
  stockImportPresetSchema,
  type StockImportProfile,
} from "@/lib/stock-import/profile";

/** #1570 — the stock import's pure core: profile, normalise, match, merge, plan. */

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const preset = (name: string) =>
  stockImportPresetSchema.parse(readJson(`lib/stock-import/presets/${name}.json`));
const aheedOwn = parseProfile(readJson("scripts/stock-import/profiles/aheed-food-centre.json"));
/** #1573 — the profile as the script loads it: its presets merged underneath. */
const aheed = applyPresets(aheedOwn, aheedOwn.presets.map(preset));

function product(over: Partial<CatalogueProduct>): CatalogueProduct {
  return {
    id: over.id ?? "p1",
    slug: "slug",
    name: "TRS FENUGREEK SEEDS 100G",
    plu: null,
    barcode: null,
    brandId: "b-trs",
    brandName: "TRS",
    categoryId: "c-nuts",
    categorySlug: "nuts",
    categoryName: "Nuts & Dried Fruit",
    basePrice: 89,
    originalPrice: null,
    unitLabel: "£0.89",
    netContentAmount: 100,
    netContentUnit: "GRAM",
    description: "",
    isActive: false,
    vatRate: 0,
    origin: null,
    isHalal: false,
    isVegetarian: false,
    isOrganic: false,
    isGlutenFree: false,
    isFresh: false,
    manuallyEditedFields: [],
    ...over,
  };
}

const grid = (rows: string[][]) => ({ fileName: "Spices.xlsx", grid: rows, firstRowNumber: 1 });

describe("profiles (R2)", () => {
  it("both committed profiles validate", () => {
    const template = JSON.parse(
      readFileSync("scripts/stock-import/profiles/_template.json", "utf8"),
    );
    expect(() => parseProfile(template)).not.toThrow();
    expect(aheed.vendorSlug).toBe("aheed-food-centre");
  });

  it("refuses an unknown key", () => {
    expect(() =>
      parseProfile({ vendorSlug: "x", columns: { name: "A" }, defaultCategory: "d", colour: 1 }),
    ).toThrow();
  });
});

describe("normalise (R4, R5)", () => {
  const { rows } = normaliseFile(
    grid([
      ["spices", "", ""],
      ["Tra Garam Masala whole ", "200grm", "£3.49"],
      ["Trs Dhania whole/powdee", "100grm", "£0.99"],
      ["Rajah Meat Tenderiser ", "100grm", "£1.99"],
      ["", "", ""],
      ["Mystery item", "", ""],
      ["Kasmiri chilli", "1kg", ""],
    ]),
    aheed,
  );

  it("reads a section heading, a brand alias, spelling and grm sizes", () => {
    expect(rows[0]).toMatchObject({
      section: "spices",
      brand: "TRS",
      displayName: "TRS Garam Masala Whole – 200g",
      netContent: { amount: 200, unit: "GRAM" },
      pricePence: 349,
      category: { slug: "spices-masalas" },
    });
  });

  it("splits a row naming two forms, and fixes 'powdee'", () => {
    expect(rows.filter((r) => r.rowNumber === 3).map((r) => r.displayName)).toEqual([
      "TRS Dhania Whole – 100g",
      "TRS Dhania Powder – 100g",
    ]);
    expect(rows.filter((r) => r.rowNumber === 3).map((r) => r.key)).toEqual([
      "Spices.xlsx#3a",
      "Spices.xlsx#3b",
    ]);
  });

  it("does not split two names that are not forms", () => {
    expect(splitForms("Pakora/ Bhajia Mix", aheed.formWords)).toEqual(["Pakora/ Bhajia Mix"]);
    expect(splitForms("sesame seeds black/white", aheed.formWords)).toEqual([
      "sesame seeds black",
      "sesame seeds white",
    ]);
  });

  it("treats a name-only row as a new section and reports a missing price and brand", () => {
    const last = rows[rows.length - 1];
    expect(last.section).toBe("mystery item");
    expect(last.issues.map((i) => i.code)).toEqual(["NO_BRAND", "NO_PRICE"]);
  });

  it("takes the brand and category from the file's defaults", () => {
    const shan = normaliseFile(
      {
        fileName: "Shan.xlsx",
        grid: [["Shan product"], ["Keema", "50grm", "£1.49"]],
        firstRowNumber: 1,
      },
      aheed,
    );
    expect(shan.rows[0]).toMatchObject({
      brand: "Shan",
      displayName: "Shan Keema – 50g",
      category: { slug: "spices-masalas" },
    });
  });

  it("derives attributes from the name", () => {
    expect(rows[0].attributes).toEqual({ Form: "Whole" });
  });
});

describe("offers and optional columns (R3, R12)", () => {
  const profile: StockImportProfile = parseProfile({
    vendorSlug: "corner-shop",
    columns: {
      name: "Product",
      price: "Price",
      size: "Size",
      wasPrice: "Was",
      multiBuy: "Deal",
      bundle: "Bundle",
      promotion: "Promo",
      vat: "VAT",
      flags: { isHalal: "Halal" },
    },
    defaultCategory: "default",
  });
  const { rows } = normaliseFile(
    {
      fileName: "list.csv",
      firstRowNumber: 1,
      grid: [
        ["Product", "Price", "Size", "Was", "Deal", "Bundle", "Promo", "VAT", "Halal"],
        [
          "Oats",
          "£2.00",
          "1kg",
          "£2.50",
          "3 for £5",
          "Breakfast box",
          "Winter warmer",
          "0%",
          "yes",
        ],
        ["Tea", "£1.00", "80s", "£0.50", "2 for £3", "", "", "17", "maybe"],
      ],
    },
    profile,
  );

  it("carries was price, multi-buy, bundle, promotion, VAT and flags", () => {
    expect(rows[0]).toMatchObject({
      wasPricePence: 250,
      multiBuy: { quantity: 3, pricePence: 500 },
      bundle: { name: "Breakfast box", quantity: 1 },
      promotion: "Winter warmer",
      vatRate: 0,
      flags: { isHalal: true },
    });
  });

  it("refuses a was price below the price, a multi-buy with no saving, a bad VAT and a bad flag", () => {
    expect(rows[1]).toMatchObject({ wasPricePence: null, multiBuy: null, vatRate: null });
    // Also NO_BRAND and BAD_SIZE ("80s" is a count, not a weight): reported, never guessed.
    expect(rows[1].issues.map((i) => i.code)).toEqual([
      "NO_BRAND",
      "BAD_SIZE",
      "BAD_WAS_PRICE",
      "BAD_MULTI_BUY",
      "BAD_VAT",
      "BAD_FLAG",
    ]);
  });

  it("parses multi-buy text", () => {
    expect(parseMultiBuy("2 for £3.50")).toEqual({ quantity: 2, pricePence: 350 });
    expect(parseMultiBuy("1 for £3")).toBeNull();
  });
});

describe("match (R6)", () => {
  const ctx = wordContext(aheed);
  const row = (name: string, size = "100grm") =>
    normaliseFile(grid([[name, size, "£0.99"]]), aheed).rows[0];
  const catalogue = [
    product({ id: "fen", name: "TRS FENUGREEK SEEDS 100G" }),
    product({ id: "leaf", name: "TRS METHI LEAVES 100G" }),
    product({ id: "big", name: "TRS GARAM MASALA 400G", netContentAmount: 400 }),
    product({ id: "plu", name: "SOMETHING ELSE", plu: "1234" }),
    product({
      id: "junk",
      name: "SHAN KARAHI - 50G",
      brandName: "SHAN KARAHI",
      netContentAmount: 50,
    }),
  ];
  const index = buildIndex(catalogue, aheed, ["TRS", "SHAN KARAHI"], ctx);

  it("matches methi seeds to fenugreek seeds, never to methi leaves", () => {
    const result = matchRow(row("Trs methis seed"), index, aheed, ctx);
    expect(result.best?.product.id).toBe("fen");
    expect(result.confidence).toBe("HIGH");
  });

  it("never matches another size, and says so", () => {
    const result = matchRow(row("Trs Garam Masala"), index, aheed, ctx);
    expect(result.confidence).toBe("NONE");
    expect(result.otherSizes.map((p) => p.id)).toEqual(["big"]);
  });

  it("matches a PLU first", () => {
    const r = { ...row("Anything"), plu: "1234" };
    expect(matchRow(r, index, aheed, ctx)).toMatchObject({
      confidence: "HIGH",
      reason: "same PLU",
    });
  });

  it("reads the real brand out of a till brand such as 'SHAN KARAHI'", () => {
    const shan = normaliseFile(
      { fileName: "Shan.xlsx", grid: [["Karahi", "50grm", "£1.49"]], firstRowNumber: 1 },
      aheed,
    ).rows[0];
    expect(matchRow(shan, index, aheed, ctx).best?.product.id).toBe("junk");
  });
});

describe("merge (R10)", () => {
  const row = normaliseFile(grid([["Trs methis seed", "100grm", "£0.99"]]), aheed).rows[0];
  const targets = { brandId: "b-trs", categoryId: "c-spice", categoryName: "Spices & Masalas" };
  const opts = { overwriteEdited: false, updateLivePrices: false };

  it("renames, reprices, moves category and keeps the unit label in step with the price", () => {
    const { changes } = computeChanges(row, product({}), targets, aheed, opts);
    expect(changes.map((c) => c.field)).toEqual(["name", "basePrice", "unitLabel", "categoryId"]);
    expect(changes.find((c) => c.field === "unitLabel")?.to).toBe("£0.99");
  });

  it("keeps a field staff edited, and a live product's price", () => {
    const { changes, kept } = computeChanges(
      row,
      product({ manuallyEditedFields: ["name"], isActive: true }),
      targets,
      aheed,
      opts,
    );
    expect(changes.map((c) => c.field)).not.toContain("name");
    expect(kept).toEqual([
      { field: "name", reason: "edited by staff" },
      { field: "basePrice", reason: "product is live (use --update-live-prices)" },
    ]);
  });

  it("never replaces a per-unit label, an existing PLU or a value the sheet leaves blank", () => {
    const { changes } = computeChanges(
      { ...row, plu: "999" },
      product({ unitLabel: "£8.90 / kg", plu: "3422", description: "Kept" }),
      targets,
      aheed,
      opts,
    );
    expect(changes.map((c) => c.field)).not.toEqual(
      expect.arrayContaining(["unitLabel", "plu", "description"]),
    );
  });
});

describe("plan (R5–R7)", () => {
  const lookups = {
    brandIds: new Map([["trs", "b-trs"]]),
    categories: new Map([["spices-masalas", { id: "c-spice", name: "Spices & Masalas" }]]),
  };
  const opts = { overwriteEdited: false, updateLivePrices: false };
  const rows = normaliseFile(
    grid([
      ["Trs methis seed", "100grm", "£0.99"],
      ["Trs fenugreek seeds", "100grm", "£1.09"],
      ["Trs Nutmeg whole", "100grm", "£3.49"],
      ["Trs nutmeg whole", "100g", "£3.49"],
      ["Trs mace", "50grm", ""],
    ]),
    aheed,
  ).rows;
  const lines = buildPlan(rows, [product({ id: "fen" })], aheed, ["TRS"], lookups, opts);

  it("suggests UPDATE, CREATE, DUPLICATE and SKIP", () => {
    expect(lines.map((l) => l.decision)).toEqual([
      "UPDATE",
      "DUPLICATE",
      "CREATE",
      "DUPLICATE",
      "SKIP",
    ]);
    expect(lines[1].reason).toContain("DIFFERENT price");
    expect(lines[4].reason).toBe("no price");
  });

  it("counts the plan", () => {
    expect(countPlan(lines)).toMatchObject({
      rows: 5,
      update: 1,
      create: 1,
      duplicate: 2,
      skip: 1,
    });
  });

  it("gives a product to the row that names it best, not the first row (#1578)", () => {
    const tikka = product({
      id: "tikka",
      name: "TRS Chicken Tikka Masala – 100g",
      categorySlug: "spices-masalas",
      categoryId: "c-spice",
    });
    const claim = normaliseFile(
      grid([
        ["Trs chicken masala", "100grm", "£2.79"],
        ["Trs chicken tikka masala", "100grm", "£2.79"],
      ]),
      aheed,
    ).rows;
    const [loose, exact] = buildPlan(claim, [tikka], aheed, ["TRS"], lookups, opts);
    expect(exact.decision).toBe("UPDATE");
    expect(exact.target?.id).toBe("tikka");
    expect(loose.decision).not.toBe("UPDATE");
    if (loose.decision === "REVIEW") expect(loose.reason).toContain("same product as");
    // A line that loses the product keeps the list's own name (no till words from it).
    expect(loose.row.displayName).not.toContain("Tikka");
  });
});
