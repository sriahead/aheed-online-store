import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CatalogueProduct } from "@/lib/stock-import/match";
import { tillCore, withTillWords } from "@/lib/stock-import/naming";
import {
  deriveAttributes,
  namingFor,
  normaliseFile,
  normaliseSizeText,
  orderWords,
} from "@/lib/stock-import/normalise";
import { buildPlan, catalogueDuplicates } from "@/lib/stock-import/plan";
import {
  applyPresets,
  inCategory,
  parseProfile,
  stockImportPresetSchema,
} from "@/lib/stock-import/profile";

/** #1573 — grocery naming standard, presets, till words and duplicate candidates. */

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const presetNames = readdirSync("scripts/stock-import/presets").map((f) => f.replace(".json", ""));
const preset = (name: string) =>
  stockImportPresetSchema.parse(readJson(`scripts/stock-import/presets/${name}.json`));
const own = parseProfile(readJson("scripts/stock-import/profiles/aheed-food-centre.json"));
const aheed = applyPresets(own, own.presets.map(preset));

const grid = (rows: string[][], fileName = "Spices.xlsx") => ({
  fileName,
  grid: rows,
  firstRowNumber: 1,
});

function product(over: Partial<CatalogueProduct>): CatalogueProduct {
  return {
    id: "p1",
    slug: "slug",
    name: "TRS BLACK ONION SEEDS 100G",
    plu: "4101",
    barcode: null,
    brandId: "b-trs",
    brandName: "TRS",
    categoryId: "c-spice",
    categorySlug: "spices-masalas",
    categoryName: "Spices & Masalas",
    basePrice: 99,
    originalPrice: null,
    unitLabel: "£0.99",
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

describe("presets", () => {
  it("every preset validates and Aheed uses all four", () => {
    expect(presetNames.sort()).toEqual(["fish", "general", "rice", "spices"]);
    for (const name of presetNames) expect(() => preset(name)).not.toThrow();
    expect(own.presets).toEqual(["general", "spices", "rice", "fish"]);
  });

  it("merges under the profile: the profile's own values win", () => {
    const profile = parseProfile({
      vendorSlug: "x",
      columns: { name: "A" },
      defaultCategory: "d",
      spelling: { tumeric: "TURMERIC" },
      derivedAttributes: [{ name: "Form", options: { Whole: ["whole"] } }],
    });
    const merged = applyPresets(profile, [preset("spices")]);
    expect(merged.spelling.tumeric).toBe("TURMERIC");
    expect(merged.spelling.corriander).toBe("coriander");
    expect(merged.derivedAttributes.filter((a) => a.name === "Form")).toHaveLength(1);
    expect(merged.categoryRules).toHaveLength(1);
  });

  it("scopes by category slug substring", () => {
    expect(inCategory(["rice"], "basmati-rice")).toBe(true);
    expect(inCategory(["rice"], "spices-masalas")).toBe(false);
    expect(inCategory(undefined, "anything")).toBe(true);
  });

  it("never derives a dietary label", () => {
    for (const name of presetNames) {
      const names = (preset(name).derivedAttributes ?? []).map((a) => a.name.toLowerCase());
      for (const dietary of ["halal", "vegetarian", "vegan", "gluten free", "organic"])
        expect(names).not.toContain(dietary);
    }
  });
});

describe("word order", () => {
  const spice = namingFor(aheed, "spices-masalas").wordOrder;

  it("puts heat and colour first and the form last, adding and removing nothing", () => {
    expect(orderWords("Chilli Powder Extra Hot", spice)).toBe("Extra Hot Chilli Powder");
    expect(orderWords("Sesame Seeds Black", spice)).toBe("Black Sesame Seeds");
    expect(orderWords("Whole Cloves", spice)).toBe("Cloves Whole");
    expect(orderWords("Whole Chilli Extra Hot", spice)).toBe("Extra Hot Chilli Whole");
    expect(orderWords("Crushed Chilli", spice)).toBe("Crushed Chilli");
    expect(orderWords("Black Pepper Whole", spice)).toBe("Black Pepper Whole");
    expect(orderWords("Garam Masala", spice)).toBe("Garam Masala");
  });

  it("leaves a name made only of moved words alone", () => {
    expect(orderWords("Whole", spice)).toBe("Whole");
  });

  it("uses the category's own rule: rice and fish differ from spices", () => {
    expect(orderWords("Rice Basmati Extra Long", namingFor(aheed, "rice").wordOrder)).toBe(
      "Extra Long Basmati Rice",
    );
    expect(orderWords("Frozen Rohu Steaks", namingFor(aheed, "fresh-fish").wordOrder)).toBe(
      "Rohu Steaks Frozen",
    );
    expect(namingFor(aheed, "household").wordOrder).toEqual({ leading: [], trailing: [] });
  });

  it("names rows from a spice list in the standard order", () => {
    const { rows } = normaliseFile(
      grid([
        ["Trs chilli powder extra hot", "100grm", "£1.49"],
        ["Trs whole cloves", "100grm", "£2.49"],
      ]),
      aheed,
    );
    expect(rows.map((r) => r.displayName)).toEqual([
      "TRS Extra Hot Chilli Powder – 100g",
      "TRS Cloves Whole – 100g",
    ]);
  });
});

describe("measurements", () => {
  it("writes g, kg, ml and L the same way", () => {
    expect(normaliseSizeText("500 gms")).toBe("500g");
    expect(normaliseSizeText("1 Kilo")).toBe("1kg");
    expect(normaliseSizeText("250 mls")).toBe("250ml");
    expect(normaliseSizeText("2 Litres")).toBe("2l");
  });
});

describe("category-specific filters", () => {
  it("derives rice and fish filters only in their own categories", () => {
    expect(deriveAttributes(aheed, "Extra Long Basmati Rice", {}, "rice")).toEqual({
      Variety: "Basmati",
      Grain: "Extra Long",
    });
    expect(deriveAttributes(aheed, "Rohu Steaks Frozen", {}, "frozen-fish")).toEqual({
      Species: "Rohu",
      Storage: "Frozen",
      Cut: "Steaks",
    });
    expect(deriveAttributes(aheed, "Cloves Whole", {}, "spices-masalas")).toEqual({
      Form: "Whole",
    });
    // A spice name is never given a fish cut or a rice grain.
    expect(deriveAttributes(aheed, "Brown Mustard Seeds Whole", {}, "spices-masalas")).toEqual({
      Form: "Whole",
    });
  });

  it("keeps a filter value the sheet gave", () => {
    expect(deriveAttributes(aheed, "Basmati Rice", { Variety: "Sella" }, "rice")).toEqual({
      Variety: "Sella",
    });
  });
});

describe("till words", () => {
  const row = (name: string) =>
    normaliseFile(grid([[name, "100grm", "£0.99"]]), aheed, ["TRS"]).rows[0];

  it("reads the till's wording without brand, size, numbers or clutter", () => {
    expect(tillCore("TRS(POPPY SEED)250G PKT", product({}), aheed, ["TRS"])).toBe("POPPY SEED");
    expect(tillCore("TRS/TANDOORI MASALA 100G", product({}), aheed, ["TRS"])).toBe(
      "TANDOORI MASALA",
    );
  });

  it("keeps a word the list dropped", () => {
    const result = withTillWords(row("Trs Black seeds"), product({}), product({}).name, aheed, [
      "TRS",
    ]);
    expect(result.row.displayName).toBe("TRS Black Onion Seeds – 100g");
    expect(result.kept).toEqual(["onion"]);
  });

  it("folds synonyms: 'Dalchini' becomes the till's 'Cinnamon Sticks'", () => {
    const till = product({ name: "TRS CINNAMON STICKS 50G" });
    const result = withTillWords(row("Trs dalchini"), till, till.name, aheed, ["TRS"]);
    expect(result.row.displayName).toBe("TRS Cinnamon Sticks – 100g");
  });

  it("counts 'curry mix' as words a shopper reads", () => {
    const till = product({ name: "SHAN KEEMA CURRY MIX/ 50G", brandName: "Shan" });
    const shan = normaliseFile(grid([["Keema", "50g", "£0.99"]], "Shan.xlsx"), aheed, ["Shan"])
      .rows[0];
    expect(withTillWords(shan, till, till.name, aheed, ["Shan"]).row.displayName).toBe(
      "Shan Keema Curry Mix – 50g",
    );
  });

  it("keeps the list's name when it has a word the till lacks, or nothing extra", () => {
    const till = product({ name: "TRS SESAME SEED 100G" });
    expect(withTillWords(row("Trs sesame seeds black"), till, till.name, aheed, []).kept).toEqual(
      [],
    );
    const same = product({ name: "TRS TURMERIC POWDER HALDI 100G" });
    expect(withTillWords(row("Trs turmeric powder"), same, same.name, aheed, []).kept).toEqual([]);
  });

  it("can be switched off", () => {
    const off = { ...aheed, keepTillWords: false };
    expect(
      withTillWords(row("Trs Black seeds"), product({}), product({}).name, off, []).kept,
    ).toEqual([]);
  });

  it("is stable: a name that already kept till words builds to itself on the next run", () => {
    const done = product({ name: "TRS Black Onion Seeds – 100g" });
    const result = withTillWords(row("Trs Black seeds"), done, done.name, aheed, ["TRS"]);
    expect(result.row.displayName).toBe(done.name);
  });

  it("apply takes till words from the product an UPDATE writes, matched or reviewed", () => {
    const script = readFileSync("scripts/stock-import.ts", "utf8");
    expect(script).toContain('w.decision === "UPDATE" && w.target\n          ? withTillWords(');
  });

  it("uses the name an earlier run replaced", () => {
    const renamed = product({ name: "TRS Black Seeds – 100g" });
    const lookups = {
      brandIds: new Map([["trs", "b-trs"]]),
      categories: new Map([["spices-masalas", { id: "c-spice", name: "Spices & Masalas" }]]),
    };
    const opts = { overwriteEdited: false, updateLivePrices: false };
    const rows = [row("Trs Black seeds")];
    const without = buildPlan(rows, [renamed], aheed, ["TRS"], lookups, opts);
    expect(without[0].changes.find((c) => c.field === "name")).toBeUndefined();
    const withEarlier = buildPlan(
      rows,
      [renamed],
      aheed,
      ["TRS"],
      lookups,
      opts,
      new Map([["p1", "TRS BLACK ONION SEEDS 100G"]]),
    );
    expect(withEarlier[0].tillWords).toEqual(["onion"]);
    expect(withEarlier[0].changes.find((c) => c.field === "name")?.to).toBe(
      "TRS Black Onion Seeds – 100g",
    );
  });

  it("never renames a product whose name staff edited", () => {
    const edited = product({ name: "TRS Black Seeds – 100g", manuallyEditedFields: ["name"] });
    const lookups = { brandIds: new Map([["trs", "b-trs"]]), categories: new Map() };
    const lines = buildPlan(
      [row("Trs Black seeds")],
      [edited],
      aheed,
      ["TRS"],
      lookups,
      { overwriteEdited: false, updateLivePrices: false },
      new Map([["p1", "TRS BLACK ONION SEEDS 100G"]]),
    );
    expect(lines[0].kept.map((k) => k.field)).toContain("name");
  });
});

describe("possible duplicates in the catalogue", () => {
  it("lists other products with the same brand, words and size, never merging them", () => {
    const a = product({ id: "a", name: "TRS SESAME SEEDS 100G", plu: "3423" });
    const b = product({ id: "b", name: "TRS Sesame Seed – 100g", plu: "4230" });
    const c = product({ id: "c", name: "TRS SESAME SEEDS 300G", netContentAmount: 300 });
    const line = { target: a } as Parameters<typeof catalogueDuplicates>[0][number];
    const found = catalogueDuplicates([line], [a, b, c], aheed, ["TRS"]);
    expect(found).toHaveLength(1);
    expect(found[0].others.map((o) => o.id)).toEqual(["b"]);
  });
});
