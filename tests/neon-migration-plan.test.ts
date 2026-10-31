import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MODEL_PLAN,
  SEEDED_VENDOR,
  applyForeignKeys,
  classifyTargetVendors,
  insertOrder,
  isDemoEmail,
  isPlaceholderKey,
  isSelectedProductSlug,
  parseForeignKeys,
  selectProducts,
  vendorDependents,
  type ForeignKey,
} from "../scripts/lib/neon-migration-plan";
import { DEMO_EMAILS, LEGACY_DEMO_EMAILS } from "../scripts/lib/demo-roster";

/**
 * #1323 — the copy plan for the move to a new Neon account
 * (spec: specs/2026-10-29-merqify-platform-move/, R9-R12a, R14).
 *
 * The schema is read from disk rather than from a hand-kept list, so adding a model to
 * `prisma/schema.prisma` without classifying it fails here — the point of R9.
 */
const schemaModels = [...readFileSync("prisma/schema.prisma", "utf8").matchAll(/^model (\w+) \{/gm)]
  .map((m) => m[1])
  .sort();

describe("MODEL_PLAN covers the schema exactly (R9)", () => {
  it("classifies every model in prisma/schema.prisma", () => {
    const missing = schemaModels.filter((m) => !(m in MODEL_PLAN));
    expect(missing).toEqual([]);
  });

  it("lists no model the schema does not have", () => {
    const extra = Object.keys(MODEL_PLAN).filter((m) => !schemaModels.includes(m));
    expect(extra).toEqual([]);
  });

  it("lists each model once (an object literal cannot, so the source is checked)", () => {
    const source = readFileSync("scripts/lib/neon-migration-plan.ts", "utf8");
    const block = source.slice(source.indexOf("export const MODEL_PLAN"), source.indexOf("};"));
    const keys = [...block.matchAll(/^\s+(\w+): \{ class:/gm)].map((m) => m[1]);
    // Every schema model must be seen by this scan, or a reformat could hide a duplicate from it.
    expect(keys.length).toBe(schemaModels.length);
    expect(keys.length).toBe(new Set(keys).size);
  });
});

describe("skipped models (R10)", () => {
  const named = [
    "Session",
    "Verification",
    "HealthCheck",
    "Cart",
    "CartItem",
    "Order",
    "OrderItem",
    "Payment",
    "OrderStatusEvent",
    "PaymentReconciliation",
    "PaymentBindingRefusal",
    "DiscountRedemption",
    "LoyaltyLedgerEntry",
    "LoyaltyAccount",
    "MarketingConsentEvent",
    "ErrorEvent",
    "SearchQueryLog",
    "AiUsageEvent",
    "AssistantConversation",
    "ProductRestrictionAuditLog",
    "VendorRoleAuditLog",
    "NetContentSuggestion",
    "DeliveryRefusalCount",
    "Review",
    "Favourite",
    "CustomerFeedback",
    "ShoppingList",
    "ShoppingListItem",
    "Address",
    "CustomerAddress",
  ];

  it.each(named)("%s is skipped", (model) => {
    expect(MODEL_PLAN[model]?.class).toBe("skip");
  });

  it("every *Attempt model in the schema is skipped, matched by name", () => {
    const attempts = schemaModels.filter((m) => m.endsWith("Attempt"));
    expect(attempts.length).toBeGreaterThan(0);
    for (const model of attempts) expect(MODEL_PLAN[model].class, model).toBe("skip");
  });
});

describe("selectProducts — the 10% sample (R11)", () => {
  it("keeps a hand-seeded (non gen-) product", () => {
    expect(isSelectedProductSlug("basmati-rice-5kg")).toBe(true);
  });

  it("keeps gen- products whose index is divisible by 10", () => {
    expect(isSelectedProductSlug("gen-0-apples")).toBe(true);
    expect(isSelectedProductSlug("gen-10-rice")).toBe(true);
  });

  it("drops other gen- products", () => {
    expect(isSelectedProductSlug("gen-11-rice")).toBe(false);
    expect(isSelectedProductSlug("gen-1999-rice")).toBe(false);
  });

  it("drops a gen- slug whose index is not an integer", () => {
    expect(isSelectedProductSlug("gen-abc-rice")).toBe(false);
  });

  it("keeps exactly 200 of the generator's 2,000 indexes", () => {
    const generated = Array.from({ length: 2000 }, (_, i) => ({ slug: `gen-${i}-x` }));
    expect(selectProducts(generated)).toHaveLength(200);
  });
});

describe("isDemoEmail (R14, #1356 R8)", () => {
  it("matches the demo and test roster regardless of case", () => {
    expect(isDemoEmail("demo-admin@example.com")).toBe(true);
    expect(isDemoEmail("Someone@EXAMPLE.com")).toBe(true);
    expect(isDemoEmail("someone@example.com")).toBe(true);
  });

  it("matches all twelve roster addresses, new and legacy", () => {
    const all = [...DEMO_EMAILS, ...LEGACY_DEMO_EMAILS];
    expect(all).toHaveLength(12);
    for (const email of all) expect(isDemoEmail(email)).toBe(true);
    expect(isDemoEmail("  Demo-Customer@MERQIFY.com ")).toBe(true);
  });

  it("does not match a real address, including other merqify.com addresses", () => {
    expect(isDemoEmail("owner@aheedfoodcentre.co.uk")).toBe(false);
    expect(isDemoEmail("x@example.com.evil.test")).toBe(false);
    expect(isDemoEmail("owner@merqify.com")).toBe(false);
    expect(isDemoEmail("info@merqify.com")).toBe(false);
    expect(isDemoEmail("demo@merqify.com")).toBe(false);
  });
});

describe("isPlaceholderKey (R18)", () => {
  it("matches a seeded placeholder object key only", () => {
    expect(isPlaceholderKey("products/gen-10-rice/main.svg")).toBe(true);
    expect(isPlaceholderKey("products/abc/1234.webp")).toBe(false);
    expect(isPlaceholderKey("categories/bakery.jpg")).toBe(false);
  });
});

describe("insertOrder", () => {
  const fk = (target: string, required = true): ForeignKey => ({
    fields: [`${target.toLowerCase()}Id`],
    references: ["id"],
    target,
    required,
  });

  it("puts every model after the models it references, ignoring self-references", () => {
    const order = insertOrder({
      Inventory: [fk("Product")],
      Product: [fk("Vendor"), fk("Category", false)],
      Category: [fk("Vendor"), fk("Category", false)],
      Vendor: [],
    });
    expect(order.indexOf("Vendor")).toBeLessThan(order.indexOf("Category"));
    expect(order.indexOf("Category")).toBeLessThan(order.indexOf("Product"));
    expect(order.indexOf("Product")).toBeLessThan(order.indexOf("Inventory"));
  });

  it("throws on a cycle between two models", () => {
    expect(() => insertOrder({ A: [fk("B")], B: [fk("A")] })).toThrow(/cycle/);
  });
});

describe("applyForeignKeys (R12a)", () => {
  const copied = new Set(["User:id:u1"]);
  const has = (model: string, field: string, value: unknown) =>
    copied.has(`${model}:${field}:${String(value)}`);
  const owner: ForeignKey = {
    fields: ["ownerId"],
    references: ["id"],
    target: "User",
    required: false,
  };
  const user: ForeignKey = {
    fields: ["userId"],
    references: ["id"],
    target: "User",
    required: true,
  };

  it("keeps a row whose parents were copied", () => {
    expect(applyForeignKeys({ id: "a", userId: "u1" }, [user], has)).toEqual({
      row: { id: "a", userId: "u1" },
      nulled: 0,
    });
  });

  it("drops a row whose required parent was not copied", () => {
    expect(applyForeignKeys({ id: "a", userId: "demo" }, [user], has).row).toBeNull();
  });

  it("nulls a nullable key to a parent that was not copied, without mutating the source row", () => {
    const source = { id: "d", ownerId: "demo" };
    const result = applyForeignKeys(source, [owner], has);
    expect(result).toEqual({ row: { id: "d", ownerId: null }, nulled: 1 });
    expect(source.ownerId).toBe("demo");
  });

  it("leaves an already-null key alone", () => {
    expect(applyForeignKeys({ id: "d", ownerId: null }, [owner], has)).toEqual({
      row: { id: "d", ownerId: null },
      nulled: 0,
    });
  });
});

describe("target vendor state (R8a, Amendment 6)", () => {
  const seeded = { id: SEEDED_VENDOR.id, slug: SEEDED_VENDOR.slug };

  it("names the vendor the multitenancy migration inserts", () => {
    const sql = readFileSync(
      "prisma/migrations/20260808130000_multitenancy_vendor_scope/migration.sql",
      "utf8",
    );
    expect(sql).toContain(`'${SEEDED_VENDOR.id}', '${SEEDED_VENDOR.slug}'`);
  });

  it("no rows is empty", () => {
    expect(classifyTargetVendors([])).toBe("empty");
  });

  it("exactly the seeded row, matched on id and slug, is seeded-only", () => {
    expect(classifyTargetVendors([seeded])).toBe("seeded-only");
  });

  it.each([
    ["the seeded id with another slug", [{ id: SEEDED_VENDOR.id, slug: "other" }]],
    ["another id with the seeded slug", [{ id: "x", slug: SEEDED_VENDOR.slug }]],
    ["one unrelated vendor", [{ id: "x", slug: "srimart" }]],
    ["the seeded row plus another", [seeded, { id: "x", slug: "srimart" }]],
    [
      "two vendors, neither seeded",
      [
        { id: "x", slug: "a" },
        { id: "y", slug: "b" },
      ],
    ],
  ])("%s is occupied", (_label, rows) => {
    expect(classifyTargetVendors(rows)).toBe("occupied");
  });
});

describe("models that can own the seeded vendor's rows (R8b)", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const dependents = vendorDependents(parseForeignKeys(schema));
  const found = new Set(dependents.map((d) => `${d.model}.${d.field}`));

  // Independent of parseForeignKeys: every `x Vendor @relation(fields: [col], ...)` line, by text.
  const fromText = new Set<string>();
  for (const block of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    for (const line of block[2].split(/\r?\n/)) {
      const m = /^\s*\w+\s+Vendor\??\s+.*@relation\(.*fields:\s*\[(\w+)\]/.exec(line);
      if (m) fromText.add(`${block[1]}.${m[1]}`);
    }
  }

  it("is derived from the schema: the same set as a plain-text scan of the relations", () => {
    expect(fromText.size).toBeGreaterThan(40);
    expect([...found].sort()).toEqual([...fromText].sort());
  });

  it("includes the models a migrated vendor would own rows in", () => {
    for (const key of [
      "Product.vendorId",
      "Category.vendorId",
      "VendorConfig.vendorId",
      "VendorDomain.vendorId",
    ]) {
      expect(found.has(key), key).toBe(true);
    }
  });

  it("excludes the vendor itself and models with no key to it", () => {
    expect(dependents.some((d) => d.model === "Vendor")).toBe(false);
    expect(dependents.some((d) => d.model === "Session")).toBe(false);
  });
});
