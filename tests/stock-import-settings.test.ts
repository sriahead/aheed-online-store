import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPresets, PRESET_NAMES } from "@/lib/stock-import/presets";
import { applyPresets, parseProfile } from "@/lib/stock-import/profile";
import {
  columnLetter,
  columnProblem,
  formatBrandAliases,
  formatFileRules,
  formatGroups,
  formatPairs,
  parseBrandAliases,
  parseFileRules,
  parseGroups,
  parsePairs,
  parseWords,
  profileFromSettings,
  settingsFromProfile,
} from "@/lib/stock-import/settings";
import {
  initialSettings,
  parseSettingsForm,
  settingsFormText,
} from "@/lib/stock-import/settings-form";

/** #1578 R1/R2 — the store's import settings ⇄ the profile the planner runs on, and their text forms. */

const aheedOwn = parseProfile(
  JSON.parse(readFileSync("scripts/stock-import/profiles/aheed-food-centre.json", "utf8")),
);
const aheed = applyPresets(aheedOwn, loadPresets(aheedOwn.presets));

const sorted = <T>(xs: T[]) => [...xs].map((x) => JSON.stringify(x)).sort();

describe("settings ⇄ profile", () => {
  it("Aheed's profile carries into settings in full and back to the same planner profile", () => {
    const { settings, notCarried } = settingsFromProfile(aheedOwn);
    expect(notCarried).toEqual([]);
    const back = profileFromSettings(settings, aheedOwn.vendorSlug);
    expect(back.columns).toEqual(aheed.columns);
    expect(back.files).toEqual(aheed.files);
    expect(back.brands).toEqual(aheed.brands);
    expect(back.spelling).toEqual(aheed.spelling);
    expect(sorted(back.synonyms)).toEqual(sorted(aheed.synonyms));
    expect(sorted(back.conflictingForms)).toEqual(sorted(aheed.conflictingForms));
    expect(new Set(back.formWords)).toEqual(new Set(aheed.formWords));
    expect(new Set(back.ignoreWords)).toEqual(new Set(aheed.ignoreWords));
    expect(back.categoryRules).toEqual(aheed.categoryRules);
    expect(back.derivedAttributes).toEqual(aheed.derivedAttributes);
    expect(back.nameTemplate).toBe(aheed.nameTemplate);
    expect(back.defaultCategory).toBe("spices-masalas");
  });

  it("reports profile keys the settings tables do not hold instead of dropping them", () => {
    const p = parseProfile({
      ...aheedOwn,
      formWords: ["whole"],
      columns: { name: "A", flags: { isHalal: "D" } },
    });
    expect(settingsFromProfile(p).notCarried).toEqual(["formWords", "columns.flags"]);
  });

  it("every preset loads and an unknown one throws", () => {
    expect(loadPresets([...PRESET_NAMES])).toHaveLength(4);
    expect(() => loadPresets(["sweets"])).toThrow(/unknown/);
  });

  it("the spices preset now holds the generic matching rules (#1578)", () => {
    const [spices] = loadPresets(["spices"]);
    expect(spices.synonyms).toContainEqual(["jeera", "cumin"]);
    expect(spices.conflictingForms).toContainEqual(["hot", "mild"]);
    expect(spices.ignoreWords).toEqual(["curry"]);
  });
});

describe("text lists", () => {
  it("pairs round-trip and lower-case their keys", () => {
    const parsed = parsePairs("Powdee = powder\n# comment\nmasla = masala", "x");
    expect(parsed).toEqual({ ok: true, value: { powdee: "powder", masla: "masala" } });
    if (parsed.ok) expect(formatPairs(parsed.value)).toBe("powdee = powder\nmasla = masala");
    expect(parsePairs("no equals", "Spelling").ok).toBe(false);
  });

  it("groups need two words", () => {
    expect(parseGroups("jeera, cumin\nhaldi,turmeric", "x")).toEqual({
      ok: true,
      value: [
        ["jeera", "cumin"],
        ["haldi", "turmeric"],
      ],
    });
    expect(parseGroups("lonely", "x").ok).toBe(false);
    expect(formatGroups([["a", "b"]])).toBe("a, b");
  });

  it("brand spellings and file rules round-trip", () => {
    const aliases = parseBrandAliases("TRS: tra, T.R.S\nShan");
    expect(aliases).toEqual({
      ok: true,
      value: [
        { brand: "TRS", aliases: ["tra", "t.r.s"] },
        { brand: "Shan", aliases: [] },
      ],
    });
    if (aliases.ok) expect(formatBrandAliases(aliases.value)).toBe("TRS: tra, t.r.s\nShan");
    const files = parseFileRules("shan = Shan | Spices & Masalas\nfrozen = | Frozen");
    expect(files).toEqual({
      ok: true,
      value: [
        { match: "shan", brand: "Shan", category: "Spices & Masalas" },
        { match: "frozen", category: "Frozen" },
      ],
    });
    if (files.ok) expect(formatFileRules(files.value)).toContain("shan = Shan | Spices & Masalas");
    expect(parseFileRules("x(= Shan |").ok).toBe(false);
    expect(parseFileRules("shan = |").ok).toBe(false);
  });

  it("words split on commas and lines", () => {
    expect(parseWords("pkt, new\nnew,offer")).toEqual(["pkt", "new", "offer"]);
  });

  it("columns are letters without a heading row", () => {
    expect(columnProblem("NONE", "A")).toBeNull();
    expect(columnProblem("NONE", "Name")).toMatch(/letter/);
    expect(columnProblem("AUTO", "Product name")).toBeNull();
    expect([0, 25, 26, 27].map(columnLetter)).toEqual(["A", "Z", "AA", "AB"]);
  });
});

describe("settings form", () => {
  const categories = [
    { slug: "spices-masalas", name: "Spices & Masalas" },
    { slug: "rice", name: "Rice" },
  ];
  const form = (values: Record<string, string>) => ({
    get: (name: string) => (name in values ? values[name] : null),
  });

  it("parses a filled form, resolving categories by name", () => {
    const parsed = parseSettingsForm(
      form({
        headerRow: "NONE",
        col_name: "a",
        col_size: "B",
        col_price: "C",
        defaultCategory: "Spices & Masalas",
        preset_general: "on",
        preset_spices: "on",
        renameMatched: "on",
        keepTillWords: "on",
        nameTemplate: "{brand} {name} – {size}",
        spelling: "masal = masala",
        sectionCategories: "rice section = Rice",
        files: "laziza = Laziza | spices-masalas",
        noiseWords: "PKT, New",
      }),
      categories,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.columns).toEqual({ name: "A", size: "B", price: "C" });
    expect(parsed.value.defaultCategorySlug).toBe("spices-masalas");
    expect(parsed.value.presets).toEqual(["general", "spices"]);
    expect(parsed.value.moveMatchedToCategory).toBe(false);
    expect(parsed.value.sectionCategories).toEqual({ "rice section": "rice" });
    expect(parsed.value.files).toEqual([
      { match: "laziza", brand: "Laziza", category: "spices-masalas" },
    ]);
    expect(parsed.value.noiseWords).toEqual(["pkt", "new"]);
    const text = settingsFormText(parsed.value, categories);
    expect(text.sectionCategories).toBe("rice section = Rice");
    expect(text.files).toBe("laziza = Laziza | Spices & Masalas");
  });

  it("refuses a missing name column, an unknown category and a template without {name}", () => {
    expect(parseSettingsForm(form({ defaultCategory: "rice" }), categories)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/name/),
    });
    expect(
      parseSettingsForm(form({ col_name: "A", defaultCategory: "Bakery" }), categories).ok,
    ).toBe(false);
    expect(
      parseSettingsForm(
        form({ col_name: "A", defaultCategory: "rice", sectionCategories: "x = Bakery" }),
        categories,
      ),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/Bakery/) });
    expect(
      parseSettingsForm(
        form({ col_name: "A", defaultCategory: "rice", nameTemplate: "{brand}" }),
        categories,
      ).ok,
    ).toBe(false);
  });

  it("first-time setup gives defaults and checks columns", () => {
    const s = initialSettings({
      headerRow: "NONE",
      columns: { name: "A", price: "C" },
      defaultCategorySlug: "rice",
      presets: ["general", "bogus"],
    });
    expect(s).toMatchObject({ ok: true, value: { presets: ["general"], renameMatched: true } });
    expect(
      initialSettings({
        headerRow: "NONE",
        columns: { name: "Name" },
        defaultCategorySlug: "rice",
        presets: [],
      }).ok,
    ).toBe(false);
  });
});
