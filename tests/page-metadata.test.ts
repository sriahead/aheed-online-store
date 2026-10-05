import { describe, expect, it } from "vitest";
import {
  buildCategoryMetadata,
  buildProductMetadata,
  truncateForDescription,
} from "@/lib/page-metadata";

/**
 * Per-page title, description and canonical for the two detail routes (#996), R25-R31.
 *
 * WHAT THESE PROVE. The builders are pure and take the host, the record and the vendor name
 * explicitly, so every rule worth asserting — the title differs per record, the description is
 * derived and bounded, the canonical is absolute and on the requesting host — is checked here
 * without a request context or a database. What they cannot prove is that each ROUTE wires them up
 * and degrades correctly when a read fails; the `generateMetadata` degradation cases below cover
 * the contract those routes implement (`return {}`), and `validation.md` R25-R29 read the live
 * `<head>`.
 */

describe("truncateForDescription", () => {
  it("returns a short description unchanged", () => {
    expect(truncateForDescription("A short description.")).toBe("A short description.");
  });

  it("collapses whitespace so a multi-line column does not become a ragged meta tag", () => {
    expect(truncateForDescription("one\n\ntwo   three\t")).toBe("one two three");
  });

  it("never exceeds the limit, counting the ellipsis (R26)", () => {
    const long = "word ".repeat(80);
    const result = truncateForDescription(long);

    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith("…")).toBe(true);
  });

  it("breaks on a word boundary rather than mid-word", () => {
    const text = `${"a".repeat(150)} boundary tail`;
    const result = truncateForDescription(text);

    // The 150-char run fits; the break must land after it, not inside "boundary".
    expect(result).toBe(`${"a".repeat(150)}…`);
  });

  it("clips a single word longer than the budget instead of returning only an ellipsis", () => {
    const result = truncateForDescription("x".repeat(400));

    expect(result).toHaveLength(160);
    expect(result.startsWith("xxxx")).toBe(true);
  });

  it("respects an explicit maximum", () => {
    // Budget is 12 minus the ellipsis, so "alpha beta" fits and "gamma" does not.
    expect(truncateForDescription("alpha beta gamma", 12)).toBe("alpha beta…");
    expect(truncateForDescription("alpha beta gamma", 12).length).toBeLessThanOrEqual(12);
  });
});

describe("buildProductMetadata (#996)", () => {
  const base = {
    host: "aheed.example",
    slug: "item-a",
    name: "Item A",
    description: "A description of item A.",
    vendorName: "First Vendor",
  };

  it("titles the page after the product and the vendor (R25)", () => {
    expect(buildProductMetadata(base).title).toBe("Item A — First Vendor");
  });

  it("gives two products two different titles (R28)", () => {
    const a = buildProductMetadata(base).title;
    const b = buildProductMetadata({ ...base, name: "Item B", slug: "item-b" }).title;

    // The defect #996 describes: both pages previously inherited one vendor-level title.
    expect(a).not.toBe(b);
  });

  it("derives the description from the product's own column (R26)", () => {
    expect(buildProductMetadata(base).description).toBe("A description of item A.");
  });

  it("emits an ABSOLUTE canonical on the requesting host (R27)", () => {
    expect(buildProductMetadata(base).alternates.canonical).toBe(
      "https://aheed.example/products/item-a",
    );
  });

  it("canonicalises a second vendor's page to that vendor's own host (R27)", () => {
    const result = buildProductMetadata({ ...base, host: "srimart.example" });

    expect(result.alternates.canonical).toBe("https://srimart.example/products/item-a");
  });

  it("never names a vendor of its own (R31)", () => {
    const result = buildProductMetadata({ ...base, vendorName: "Second Vendor" });

    // `vendorName` is required rather than defaulted: a default would advertise one vendor on
    // every other storefront whenever a caller forgot the argument (#729).
    expect(result.title).toContain("Second Vendor");
    expect(JSON.stringify(result)).not.toContain("First Vendor");
  });
});

describe("buildCategoryMetadata (#996)", () => {
  const base = {
    host: "aheed.example",
    slug: "dept-one",
    name: "Dept One",
    vendorName: "First Vendor",
  };

  it("titles the page after the category and the vendor (R29)", () => {
    expect(buildCategoryMetadata(base).title).toBe("Dept One — First Vendor");
  });

  it("composes a description, since Category has no description column (R29)", () => {
    const result = buildCategoryMetadata(base);

    expect(result.description).toBe("Browse Dept One at First Vendor.");
    expect(result.description.length).toBeLessThanOrEqual(160);
  });

  it("emits an absolute canonical on the requesting host (R29)", () => {
    expect(buildCategoryMetadata(base).alternates.canonical).toBe(
      "https://aheed.example/categories/dept-one",
    );
  });

  it("names no product category, so it reads correctly for any vendor (R31)", () => {
    const text = JSON.stringify(buildCategoryMetadata(base)).toLowerCase();

    for (const noun of ["grocery", "groceries", "electronics", "food"]) {
      expect(text).not.toContain(noun);
    }
  });
});

/**
 * R30 — a failed read must leave the route's INHERITED metadata in place, not throw.
 *
 * Both routes implement this by returning `{}` from a `try`/`catch`, so `app/layout.tsx`'s
 * vendor-aware metadata stands. That is the same degradation the layout itself already performs
 * for a DB hiccup, and the reason it matters is that `generateMetadata` runs on the request path:
 * an uncaught rejection there turns a product page from 200 into 500 because its `<head>` could
 * not be built. The contract is asserted here against the shape the routes rely on.
 */
describe("metadata degradation (R30)", () => {
  async function generateLike(read: () => Promise<{ name: string }>) {
    try {
      const record = await read();
      return buildProductMetadata({
        host: "aheed.example",
        slug: "item-a",
        name: record.name,
        description: "d",
        vendorName: "First Vendor",
      });
    } catch {
      return {};
    }
  }

  it("resolves to empty metadata when the record read rejects", async () => {
    await expect(
      generateLike(async () => {
        throw new Error("database unavailable");
      }),
    ).resolves.toEqual({});
  });

  it("resolves to real metadata when the read succeeds", async () => {
    const result = await generateLike(async () => ({ name: "Item A" }));

    expect(result).toMatchObject({ title: "Item A — First Vendor" });
  });
});
