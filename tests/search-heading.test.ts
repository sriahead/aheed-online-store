import { describe, expect, it } from "vitest";
import { searchHeading } from "@/components/product/search-heading";

/** #1173 R1 — the /search heading's three cases. Test data only, no vendor names. */
describe("searchHeading (#1173 R1)", () => {
  it("names the query, with or without a category", () => {
    expect(searchHeading("juice")).toBe("Results for “juice”");
    expect(searchHeading("juice", "Dept One")).toBe("Results for “juice”");
  });

  it("names the category when there is no query", () => {
    expect(searchHeading("", "Dept One")).toBe("Dept One");
  });

  it("falls back to All products with neither", () => {
    expect(searchHeading("")).toBe("All products");
    expect(searchHeading("", null)).toBe("All products");
  });
});
