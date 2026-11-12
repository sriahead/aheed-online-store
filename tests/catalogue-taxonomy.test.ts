import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { flatten, isTitleCase, type Taxonomy } from "@/scripts/catalogue-taxonomy";

const taxonomy = JSON.parse(
  readFileSync("prisma/manifests/aheed-taxonomy.json", "utf8"),
) as Taxonomy;
const plan = flatten(taxonomy);

describe("#1330 S1b taxonomy (the real file)", () => {
  it("has a small set of shopper departments; the hidden groups are inactive", () => {
    const tops = plan.filter((n) => n.parentSlug === null);
    const visible = tops.filter((n) => n.active !== false);
    expect(visible.length).toBeLessThanOrEqual(12);
    for (const slug of ["not-sold-online", "default"]) {
      expect(tops.find((n) => n.slug === slug)?.active).toBe(false);
    }
  });

  it("names every department and sub-department in Title Case", () => {
    const bad = plan.filter((n) => !isTitleCase(n.name)).map((n) => n.name);
    expect(bad).toEqual([]);
  });

  it("keeps every restricted till department under the hidden group, inactive", () => {
    for (const slug of ["tobacco", "alcohol", "phone-cards", "news", "instant-lottery", "stamps"]) {
      const n = plan.find((x) => x.slug === slug);
      expect(n?.parentSlug).toBe("not-sold-online");
      expect(n?.active).toBe(false);
    }
    expect(plan.find((n) => n.slug === "phone-cards")?.absorb).toContain("e-pay");
  });

  it("orders siblings and gives every node a parent that comes before it", () => {
    const index = new Map(plan.map((n, i) => [n.slug, i]));
    for (const n of plan)
      if (n.parentSlug) expect(index.get(n.parentSlug)!).toBeLessThan(index.get(n.slug)!);
  });
});

describe("#1330 S1b taxonomy helpers", () => {
  it("refuses a duplicate slug", () => {
    const t: Taxonomy = {
      archive: { slug: "archived", name: "Archived" },
      departments: [
        { slug: "a", name: "A", children: [{ slug: "b", name: "B" }] },
        { slug: "b", name: "B" },
      ],
    };
    expect(() => flatten(t)).toThrow("slug b appears twice");
  });

  it("recognises Title Case", () => {
    expect(isTitleCase("Crab, Squid & Seafood")).toBe(true);
    expect(isTitleCase("Phone Cards & Top-ups")).toBe(false);
    expect(isTitleCase("Food To Go")).toBe(true);
    expect(isTitleCase("SOFT DRINKS")).toBe(false);
    expect(isTitleCase("Juices & soft drinks")).toBe(false);
  });
});
