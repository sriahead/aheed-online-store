import { describe, expect, it, vi } from "vitest";
import {
  FISH_PRODUCTS,
  planFishProducts,
  toSeedProducts,
  type FishCategoryState,
} from "../prisma/fish-products";
import { toProductInput, writeFishProductChanges } from "../prisma/fish-products-write";
import { deriveUnitPriceLabel } from "@/components/product/unit-price";
import type { CatalogueWriteResult, ProductWriteInput } from "@/lib/repositories/products";

/**
 * #1147 R2-R9 and R17 — the decisions behind `scripts/add-fish-products.ts`. The script only reads a
 * vendor, prints this plan and (with `--apply`) writes it through `createProductForVendor`, so these
 * fixtures are the whole of its behaviour short of the database round-trip, which validation runs
 * live.
 */

/** slug, name, sub-category, pence, net content amount, net content unit — the plan's table. */
const EXPECTED = [
  ["atlantic-salmon-fillets-240g", "Atlantic Salmon Fillets 240g", "fresh-fish", 499, 240, "GRAM"],
  ["cod-fillets-400g", "Cod Fillets 400g", "fresh-fish", 649, 400, "GRAM"],
  ["sea-bass-fillets-260g", "Sea Bass Fillets 260g", "fresh-fish", 499, 260, "GRAM"],
  ["whole-sea-bream", "Whole Sea Bream", "fresh-fish", 399, 1, "EACH"],
  ["whole-tilapia", "Whole Tilapia", "fresh-fish", 349, 1, "EACH"],
  ["whole-mackerel-2-pack-500g", "Whole Mackerel (2) 500g", "fresh-fish", 329, 500, "GRAM"],
  ["whole-rainbow-trout", "Whole Rainbow Trout", "fresh-fish", 349, 1, "EACH"],
  ["raw-king-prawns-300g", "Raw King Prawns 300g", "fresh-fish", 599, 300, "GRAM"],
  ["whole-silver-pomfret-800g", "Whole Silver Pomfret 800g", "frozen-fish", 699, 800, "GRAM"],
  ["rohu-steaks-1kg", "Rohu Steaks 1kg", "frozen-fish", 749, 1000, "GRAM"],
  ["hilsa-ilish-cuts-1kg", "Hilsa (Ilish) Cuts 1kg", "frozen-fish", 1499, 1000, "GRAM"],
  ["whole-tilapia-1kg", "Whole Tilapia 1kg", "frozen-fish", 549, 1000, "GRAM"],
  ["kingfish-seer-steaks-1kg", "Kingfish (Seer) Steaks 1kg", "frozen-fish", 999, 1000, "GRAM"],
  ["basa-fillets-1kg", "Basa Fillets 1kg", "frozen-fish", 599, 1000, "GRAM"],
  ["frozen-cod-fillets-800g", "Cod Fillets 800g", "frozen-fish", 749, 800, "GRAM"],
  ["raw-king-prawns-peeled-500g", "Raw King Prawns Peeled 500g", "frozen-fish", 699, 500, "GRAM"],
  ["salmon-fillets-4-pack-500g", "Salmon Fillets 4 Pack 500g", "frozen-fish", 649, 500, "GRAM"],
  ["squid-rings-500g", "Squid Rings 500g", "frozen-fish", 399, 500, "GRAM"],
] as const;

const FORBIDDEN_WORDS = [
  "halal",
  "organic",
  "msc",
  "hmc",
  "certified",
  "sustainab",
  "wild",
  "farmed",
  "caught",
  "scottish",
  "norwegian",
  "british",
  "local",
  "premium",
  "freshly",
];

function category(
  slug: string,
  parentId: string | null = null,
  isActive = true,
): FishCategoryState {
  return { id: `id-${slug}`, slug, parentId, isActive };
}

const TREE = [
  category("fish"),
  category("fresh-fish", "id-fish"),
  category("frozen-fish", "id-fish"),
];

function plan(categories: FishCategoryState[] = TREE, existing: string[] = []) {
  return planFishProducts({ categories, existingProductSlugs: existing });
}

describe("FISH_PRODUCTS (R2)", () => {
  it("equals the plan's table, row for row", () => {
    expect(
      FISH_PRODUCTS.map((p) => [
        p.slug,
        p.name,
        p.subcategory,
        p.basePricePence,
        p.netContent.amount,
        p.netContent.unit,
      ]),
    ).toEqual(EXPECTED.map((row) => [...row]));
  });

  it("splits 8 fresh and 10 frozen", () => {
    expect(FISH_PRODUCTS.filter((p) => p.subcategory === "fresh-fish")).toHaveLength(8);
    expect(FISH_PRODUCTS.filter((p) => p.subcategory === "frozen-fish")).toHaveLength(10);
  });

  it("has well-formed, unique slugs and positive whole numbers", () => {
    const slugs = FISH_PRODUCTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const p of FISH_PRODUCTS) {
      expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.slug.length).toBeLessThanOrEqual(80);
      expect(Number.isInteger(p.basePricePence) && p.basePricePence > 0).toBe(true);
      expect(Number.isInteger(p.netContent.amount) && p.netContent.amount > 0).toBe(true);
    }
  });
});

describe("what every change carries (R3, R4)", () => {
  const { changes } = plan();

  it("derives the unit label from the price and net content (R3)", () => {
    expect(changes).toHaveLength(18);
    for (const change of changes) {
      const expected = deriveUnitPriceLabel(change.basePrice, {
        amount: change.netContentAmount,
        unit: change.netContentUnit,
      });
      expect(expected).not.toBeNull();
      expect(change.unitLabel).toBe(expected);
    }
  });

  it("claims nothing that nobody has verified (R4)", () => {
    for (const change of changes) {
      expect(change).toMatchObject({
        origin: null,
        brandId: null,
        originalPrice: null,
        tier: null,
        attributeValues: [],
        isHalal: false,
        isFresh: false,
        isOrganic: false,
        isVegetarian: false,
        isGlutenFree: false,
        isHmcCertified: false,
        hmcReference: null,
        hmcVerifiedAt: null,
      });
    }
  });

  it("describes each product plainly and names its allergen (R4)", () => {
    for (const change of changes) {
      expect(change.description).toMatch(/^.{10,200} Contains: (Fish|Crustaceans|Molluscs)\.$/);
      for (const word of FORBIDDEN_WORDS) {
        expect(change.description.toLowerCase()).not.toContain(word);
      }
    }
    const allergenOf = (slug: string) =>
      changes.find((c) => c.slug === slug)?.description.match(/Contains: (\w+)\.$/)?.[1];
    const crustaceans = changes.filter((c) => allergenOf(c.slug) === "Crustaceans");
    const molluscs = changes.filter((c) => allergenOf(c.slug) === "Molluscs");
    expect(crustaceans.map((c) => c.slug).sort()).toEqual([
      "raw-king-prawns-300g",
      "raw-king-prawns-peeled-500g",
    ]);
    expect(molluscs.map((c) => c.slug)).toEqual(["squid-rings-500g"]);
  });
});

describe("planFishProducts", () => {
  it("a complete tree with no products: 18 creates in table order, not blocked (R5)", () => {
    const result = plan();
    expect(result.blocked).toBeNull();
    expect(result.changes.map((c) => c.slug)).toEqual(EXPECTED.map((row) => row[0]));
    expect(result.changes.every((c) => c.kind === "create-product")).toBe(true);
    expect(result.categoryIds).toEqual({
      "fresh-fish": "id-fresh-fish",
      "frozen-fish": "id-frozen-fish",
    });
  });

  describe("an incomplete tree is blocked and plans nothing (R6)", () => {
    const cases: [string, FishCategoryState[]][] = [
      [
        "no fish department",
        [category("fresh-fish", "id-fish"), category("frozen-fish", "id-fish")],
      ],
      ["no fresh-fish", [category("fish"), category("frozen-fish", "id-fish")]],
      ["no frozen-fish", [category("fish"), category("fresh-fish", "id-fish")]],
      [
        "fresh-fish under another parent",
        [category("fish"), category("fresh-fish", "id-other"), category("frozen-fish", "id-fish")],
      ],
      [
        "fish is itself a sub-category",
        [
          category("fish", "id-other"),
          category("fresh-fish", "id-fish"),
          category("frozen-fish", "id-fish"),
        ],
      ],
    ];
    for (const [name, categories] of cases) {
      it(name, () => {
        const result = plan(categories);
        expect(result.blocked).toContain("scripts/apply-department-changes.ts");
        expect(result.changes).toEqual([]);
        expect(result.categoryIds).toEqual({});
      });
    }
  });

  it("skips a slug that exists in any category, with a note naming it (R7)", () => {
    const result = plan(TREE, ["cod-fillets-400g"]);
    expect(result.changes).toHaveLength(17);
    expect(result.changes.map((c) => c.slug)).not.toContain("cod-fillets-400g");
    expect(result.notes.filter((n) => n.includes("cod-fillets-400g"))).toHaveLength(1);
  });

  it("plans nothing when every slug exists, so a plan after its own changes is empty (R7)", () => {
    const first = plan();
    const second = plan(
      TREE,
      first.changes.map((c) => c.slug),
    );
    expect(second.changes).toEqual([]);
    expect(second.blocked).toBeNull();
  });

  it("still plans under a hidden department, and says so (R8)", () => {
    const result = plan([
      category("fish", null, false),
      category("fresh-fish", "id-fish"),
      category("frozen-fish", "id-fish"),
    ]);
    expect(result.changes).toHaveLength(18);
    expect(result.notes.some((n) => n.includes("hidden"))).toBe(true);
  });
});

describe("writeFishProductChanges (R9)", () => {
  const { changes, categoryIds } = plan();
  const ok = (id = "p"): CatalogueWriteResult => ({ ok: true, id });

  it("passes the change's fields through and adds only the decisions made here", async () => {
    const create = vi.fn(async (_input: ProductWriteInput) => ok());
    const summary = await writeFishProductChanges(create, categoryIds, changes.slice(0, 1), {
      active: false,
      stock: 0,
    });
    expect(summary).toEqual({ created: [changes[0].slug], skipped: [], failed: null });
    const input = create.mock.calls[0][0];
    expect(input).toMatchObject({
      slug: changes[0].slug,
      name: changes[0].name,
      basePrice: changes[0].basePrice,
      unitLabel: changes[0].unitLabel,
      netContentAmount: changes[0].netContentAmount,
      netContentUnit: changes[0].netContentUnit,
      categoryId: "id-fresh-fish",
      isActive: false,
      quantity: 0,
      isFeatured: false,
      expectedRestockDay: null,
    });
    expect(input).not.toHaveProperty("kind");
    expect(input).not.toHaveProperty("subcategory");
  });

  it("carries --active and --stock into every call, and files each product in its own sub-category", async () => {
    const create = vi.fn(async (_input: ProductWriteInput) => ok());
    await writeFishProductChanges(create, categoryIds, changes, { active: true, stock: 10 });
    expect(create).toHaveBeenCalledTimes(18);
    for (const [input] of create.mock.calls) {
      expect(input.isActive).toBe(true);
      expect(input.quantity).toBe(10);
    }
    const byCategory = (id: string) =>
      create.mock.calls.filter(([i]) => i.categoryId === id).length;
    expect(byCategory("id-fresh-fish")).toBe(8);
    expect(byCategory("id-frozen-fish")).toBe(10);
  });

  it("counts a duplicate-slug answer as skipped and carries on", async () => {
    const create = vi.fn(async (input: ProductWriteInput): Promise<CatalogueWriteResult> =>
      input.slug === changes[1].slug ? { ok: false, error: "taken", field: "slug" } : ok(),
    );
    const summary = await writeFishProductChanges(create, categoryIds, changes, {
      active: false,
      stock: 0,
    });
    expect(summary.skipped).toEqual([changes[1].slug]);
    expect(summary.created).toHaveLength(17);
    expect(summary.failed).toBeNull();
    expect(create).toHaveBeenCalledTimes(18);
  });

  it("stops on any other refusal, names the slug and keeps what was created", async () => {
    const create = vi.fn(async (input: ProductWriteInput): Promise<CatalogueWriteResult> =>
      input.slug === changes[2].slug ? { ok: false, error: "bad name", field: "name" } : ok(),
    );
    const summary = await writeFishProductChanges(create, categoryIds, changes, {
      active: false,
      stock: 0,
    });
    expect(summary.created).toEqual([changes[0].slug, changes[1].slug]);
    expect(summary.failed).toEqual({ slug: changes[2].slug, error: "bad name" });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("stops on a thrown error the same way", async () => {
    const create = vi.fn(async (input: ProductWriteInput): Promise<CatalogueWriteResult> => {
      if (input.slug === changes[1].slug) throw new Error("connection reset");
      return ok();
    });
    const summary = await writeFishProductChanges(create, categoryIds, changes, {
      active: false,
      stock: 0,
    });
    expect(summary.created).toEqual([changes[0].slug]);
    expect(summary.failed).toEqual({ slug: changes[1].slug, error: "connection reset" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("stops without calling create when a sub-category has no id", async () => {
    const create = vi.fn(async (_input: ProductWriteInput) => ok());
    const summary = await writeFishProductChanges(create, {}, changes, { active: false, stock: 0 });
    expect(create).not.toHaveBeenCalled();
    expect(summary.failed?.slug).toBe(changes[0].slug);
  });

  it("toProductInput uses the figures it is given", () => {
    const input = toProductInput(changes[0], "cat-1", { active: true, stock: 7 });
    expect(input).toMatchObject({ categoryId: "cat-1", isActive: true, quantity: 7 });
  });
});

describe("toSeedProducts (R17)", () => {
  const seed = toSeedProducts();

  it("has exactly the two sub-category keys with 8 and 10 products", () => {
    expect(Object.keys(seed).sort()).toEqual(["fresh-fish", "frozen-fish"]);
    expect(seed["fresh-fish"]).toHaveLength(8);
    expect(seed["frozen-fish"]).toHaveLength(10);
  });

  it("carries the table's slug, name and price, the derived unit label, and stock 20", () => {
    const flat = [...seed["fresh-fish"], ...seed["frozen-fish"]];
    expect(flat.map((p) => [p.slug, p.name, p.basePrice])).toEqual(
      EXPECTED.map((row) => [row[0], row[1], row[3]]),
    );
    for (const [index, product] of flat.entries()) {
      const row = EXPECTED[index];
      expect(product.unitLabel).toBe(
        deriveUnitPriceLabel(row[3], { amount: row[4], unit: row[5] }),
      );
      expect(product.quantity).toBe(20);
      expect(product.description.length).toBeGreaterThan(0);
    }
  });
});
