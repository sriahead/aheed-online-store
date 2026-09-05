import { describe, expect, it, vi } from "vitest";
import { suggestProducts } from "@/lib/repositories/products";
import { suggestCategories } from "@/lib/repositories/categories";

/**
 * P2.6 slice 5 (#568), R24-R28 — autocomplete's query shape and its bounds.
 *
 * Tested at the repository functions the route composes rather than by invoking the route handler,
 * for the reason the requirements are written the way they are: every one of these is a statement
 * about the QUERY (its fields, its `take`, and in R24's case that it never happens at all), and a
 * spy is the only thing that can demonstrate a negative. A live call returning plausible rows is
 * equally consistent with `description` having been included or the cap having been ignored.
 *
 * The route's own vendor-resolution, header and slicing behaviour are covered live in
 * `validation.md` (R23, R26, R29, R30) against `npm run preview` and a deployed environment — the
 * per-host cache row in particular cannot be proven anywhere but a real deployment.
 */

const VENDOR = "vendor-1";

function makeStub(rows: { id: string; slug: string; name: string; quantity: number }[]) {
  const spies = {
    productFindMany: vi.fn(async (_args: unknown) =>
      rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        inventory: { quantity: r.quantity },
      })),
    ),
    categoryFindMany: vi.fn(async (_args: unknown) => [] as unknown[]),
    synonymFindMany: vi.fn(async (_args: unknown) => [] as { alias: string; canonical: string }[]),
  };
  const client = {
    product: { findMany: spies.productFindMany },
    category: { findMany: spies.categoryFindMany },
    searchSynonym: { findMany: spies.synonymFindMany },
  };
  return { client: client as never, spies };
}

function capturedArgs(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls[0][0] as Record<string, never>;
}

describe("suggestProducts issues no query for an unusable query (R24)", () => {
  it("returns empty and never touches the client", async () => {
    const { client, spies } = makeStub([]);

    // "e" is a single character, which `parseSearchQuery` has dropped since #572 — the cheapest
    // abusive request must not reach the database at all. This is the first of the route's bounds.
    expect(await suggestProducts(client, VENDOR, "e", 30)).toEqual([]);
    expect(await suggestProducts(client, VENDOR, "", 30)).toEqual([]);
    expect(await suggestProducts(client, VENDOR, "  -  ", 30)).toEqual([]);

    expect(spies.productFindMany).not.toHaveBeenCalled();
    expect(spies.synonymFindMany).not.toHaveBeenCalled();
  });
});

describe("suggestProducts query shape (R25)", () => {
  it("matches name only — never description", async () => {
    const { client, spies } = makeStub([]);
    await suggestProducts(client, VENDOR, "basmati rice", 30);

    const where = JSON.stringify(capturedArgs(spies.productFindMany).where);
    expect(where).toContain("name");
    expect(where).not.toContain("description");
  });

  it("requires every term (AND), each satisfied by that term's variants", async () => {
    const { client, spies } = makeStub([]);
    await suggestProducts(client, VENDOR, "basmati rice", 30);

    const where = capturedArgs(spies.productFindMany).where as unknown as {
      AND: { OR: { name: { contains: string } }[] }[];
    };
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR.map((c) => c.name.contains)).toEqual(["basmati"]);
    expect(where.AND[1].OR.map((c) => c.name.contains)).toEqual(["rice"]);
  });

  it("widens a term with its approved alias (#566's dictionary)", async () => {
    const { client, spies } = makeStub([]);
    spies.synonymFindMany.mockResolvedValueOnce([{ alias: "dhania", canonical: "coriander" }]);

    await suggestProducts(client, VENDOR, "dhania", 30);

    const where = capturedArgs(spies.productFindMany).where as unknown as {
      AND: { OR: { name: { contains: string } }[] }[];
    };
    expect(where.AND[0].OR.map((c) => c.name.contains)).toEqual(["dhania", "coriander"]);
  });

  it("scopes to the vendor and to active products", async () => {
    const { client, spies } = makeStub([]);
    await suggestProducts(client, VENDOR, "rice", 30);

    expect(capturedArgs(spies.productFindMany).where).toMatchObject({
      vendorId: VENDOR,
      isActive: true,
    });
  });
});

describe("suggestProducts bounds and ranking (R26, R27)", () => {
  it("passes the candidate limit it was given as take", async () => {
    const { client, spies } = makeStub([]);
    await suggestProducts(client, VENDOR, "rice", 30);

    expect(capturedArgs(spies.productFindMany).take).toBe(30);
  });

  it("orders by the same ranking the results page uses", async () => {
    // Tier 0 is an exact whole-name match; a shorter name breaks a tier tie. An out-of-stock exact
    // match still outranks an in-stock partial one — relevance dominates availability by design
    // (#564), and autocomplete must not quietly reverse that.
    const { client } = makeStub([
      { id: "p1", slug: "rice-cakes", name: "Rice Cakes Snack Pack", quantity: 5 },
      { id: "p2", slug: "rice", name: "Rice", quantity: 0 },
      { id: "p3", slug: "rice-flour", name: "Rice Flour", quantity: 5 },
    ]);

    const ranked = await suggestProducts(client, VENDOR, "rice", 30);
    expect(ranked.map((p) => p.slug)).toEqual(["rice", "rice-flour", "rice-cakes"]);
  });

  it("reports stock state per suggestion", async () => {
    const { client } = makeStub([
      { id: "p1", slug: "rice", name: "Rice", quantity: 0 },
      { id: "p2", slug: "rice-flour", name: "Rice Flour", quantity: 3 },
    ]);

    const ranked = await suggestProducts(client, VENDOR, "rice", 30);
    expect(ranked.find((p) => p.slug === "rice")?.inStock).toBe(false);
    expect(ranked.find((p) => p.slug === "rice-flour")?.inStock).toBe(true);
  });
});

describe("suggestCategories (R26)", () => {
  it("ORs across terms and caps at the limit it was given", async () => {
    const { client, spies } = makeStub([]);
    await suggestCategories(client, VENDOR, ["basmati", "rice"], 3);

    const args = capturedArgs(spies.categoryFindMany);
    expect(args.take).toBe(3);
    // OR rather than AND deliberately: a category name is one or two words, so requiring every
    // term of "basmati rice" to appear would offer no category at all where "Rice" is the useful
    // answer.
    const where = args.where as unknown as { OR: { name: { contains: string } }[] };
    expect(where.OR.map((c) => c.name.contains)).toEqual(["basmati", "rice"]);
  });

  it("issues no query with no terms", async () => {
    const { client, spies } = makeStub([]);
    expect(await suggestCategories(client, VENDOR, [], 3)).toEqual([]);
    expect(spies.categoryFindMany).not.toHaveBeenCalled();
  });
});

/**
 * R28 — the route must never write a `SearchQueryLog` row.
 *
 * This is not a performance preference. Autocomplete runs once per keystroke, so logging here
 * would flood the exact table `#566`'s synonym proposals read to decide which queries recur — one
 * feature silently corrupting a neighbour's input. Asserted at the source, because the failure mode
 * is an import someone adds later for what looks like a good reason.
 */
describe("the suggest route writes no search query log (R28)", () => {
  it("does not reference the search query log at all", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/api/search/suggest/route.ts", "utf8");

    expect(source).not.toContain("search-query-log");
    expect(source).not.toContain("recordSearchQuery");
  });
});
