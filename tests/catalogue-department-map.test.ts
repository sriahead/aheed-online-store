import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  csvField,
  mapLine,
  matchKeyword,
  type DepartmentRules,
} from "@/scripts/lib/department-map";
import { tillLinesByPlu } from "@/scripts/catalogue-department-map";

const rules = JSON.parse(
  readFileSync("prisma/manifests/aheed-department-map.json", "utf8"),
) as DepartmentRules;

describe("#1330 S1b department rules (the real rules file)", () => {
  it.each([
    // [till dept, till sub-dept, name, expected target]
    ["GROCERIES", "OILS AND SPICES", "PRIDE GROUNDNUT OIL 1LTR", "cooking-oils"],
    ["GROCERIES", "OILS AND SPICES", "AACHI SAMBAR POWDER 200G", "spices-masalas"],
    ["GROCERIES", "PASTA / RICE", "AANI BASMATI RICE", "rice-grains"],
    ["GROCERIES", "PASTA / RICE", "ALBERTO FUSILLI PASTA", "pasta-noodles"],
    ["GROCERIES", "FISH TINNED", "SARDINES OIL", "tinned-food"],
    ["GROCERIES", "TEA AND COFFEE", "TETLEY 80", "tea-coffee"],
    ["GROCERIES", "BREAD / EGG", "12 EGGS", "eggs-butter"],
    ["DEFAULT", "DEFAULT", "TB PLAIN NAAN 600G", "bread-loaves"],
    ["DEFAULT", "DEFAULT", "5KG ANJOMAN RICE", "rice-grains"],
    ["DEFAULT", "DEFAULT", "LIFEBUOY SOAP", "health-beauty"],
    ["SOFT DRINKS", "CANS", "FANTA ORANGE 250ML", "juices-soft-drinks"],
    ["CONFECTIONERY", "", "DAIRY MILK", "biscuits-sweets"],
    ["FRUIT & VEG", "FRUIT & VEG", "ALPHONSO MANGO BOX", "fresh-fruit"],
  ])("%s / %s / %s → %s", (dept, sub, name, expected) => {
    expect(mapLine(dept, sub, name, rules).target).toBe(expected);
  });

  it("keeps restricted and non-food till departments where they are", () => {
    expect(mapLine("TOBACCO", "", "RIZLA SILVER", rules).target).toBe("keep");
    expect(mapLine("STAMPS", "", "STAMPS 12ST CLASS", rules).target).toBe("keep");
    expect(mapLine("NON FOOD", "", "UMBRELLA", rules).target).toBe("keep");
  });

  it("sends an unrecognised DEFAULT line, and an unknown department, to review", () => {
    expect(mapLine("DEFAULT", "DEFAULT", "AURA", rules).target).toBe("review");
    expect(mapLine("SOMETHING NEW", "", "X", rules)).toEqual({
      target: "review",
      rule: "no rule for department SOMETHING NEW",
    });
  });

  it("limits fresh-produce words to the FRUIT & VEG department", () => {
    expect(mapLine("DEFAULT", "DEFAULT", "GOLDEN APPLE RINGS", rules).target).toBe("review");
    expect(mapLine("GROCERIES", "BEVERAGES", "MANGO PULP NETCO", rules).target).toBe("beverages");
  });

  it("every target is an existing designed slug, keep/review, or a declared new category", () => {
    const designed = new Set([
      "groceries",
      "rice-grains",
      "lentils-pulses",
      "cooking-oils",
      "beverages",
      "tea-coffee",
      "juices-soft-drinks",
      "water-mixers",
      "bakery",
      "bread-loaves",
      "pastries",
      "cakes-desserts",
      "snacks",
      "crisps-namkeen",
      "biscuits-sweets",
      "nuts-dried-fruit",
      "dairy-eggs",
      "milk-cream",
      "cheese-paneer",
      "eggs-butter",
      "baby-kids",
      "pet-supplies",
      "halal-meat",
      "fish",
      "household",
      "cleaning",
      "kitchen-foil",
      "paper-toiletries",
      "fruit-veg",
      "fresh-fruit",
      "fresh-vegetables",
      "herbs-salads",
      "frozen-foods",
      "chilled-foods",
      "food-to-go",
      "health-beauty",
      "keep",
      "review",
    ]);
    const targets = [
      ...rules.nameKeywords.map((k) => k.target),
      ...Object.values(rules.departments).map((r) => (typeof r === "string" ? r : r.target)),
      ...Object.values(rules.subDepartments).flatMap((s) =>
        Object.values(s).map((r) => (typeof r === "string" ? r : r.target)),
      ),
    ];
    for (const t of targets) expect(designed.has(t) || t in rules.newCategories).toBe(true);
  });
});

describe("#1330 S1b helpers", () => {
  it("matches whole words only", () => {
    const groups = [{ words: ["TIN"], target: "tinned-food" }];
    expect(matchKeyword("CHICKPEAS TIN 400G", groups)?.target).toBe("tinned-food");
    expect(matchKeyword("TINTED LIP BALM", groups)).toBeNull();
  });

  it("reads PLU → department from a till export with preamble rows", () => {
    const grid = [
      ["Current Stock List"],
      ["No", "PLU", "Barcode", "Description", "Dept", "SubDept"],
      ["1", "12670", "", "STELLA BOTTLE", "ALCOHOL", "BOTTLE BEERS"],
    ];
    expect(tillLinesByPlu(grid).get("12670")).toEqual({ dept: "ALCOHOL", sub: "BOTTLE BEERS" });
  });

  it("quotes CSV fields only when needed", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('A "B", C')).toBe('"A ""B"", C"');
    expect(csvField(null)).toBe("");
  });
});
