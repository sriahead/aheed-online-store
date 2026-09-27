import { describe, expect, it } from "vitest";
import { resolveAttributeFilters } from "@/lib/attribute-filters";

/** #912, R19 — `attr_*` params resolve only against the vendor's own filters and values. */
const ATTRIBUTES = [
  {
    slug: "colour",
    name: "Colour",
    options: [
      { id: "opt-black", slug: "black", name: "Black" },
      { id: "opt-white", slug: "white", name: "White" },
    ],
  },
  {
    slug: "connectivity",
    name: "Connectivity",
    options: [{ id: "opt-wireless", slug: "wireless", name: "Wireless" }],
  },
];

describe("resolveAttributeFilters", () => {
  it("resolves a known filter and value", () => {
    expect(resolveAttributeFilters({ attr_colour: "black" }, ATTRIBUTES)).toEqual({
      optionIds: ["opt-black"],
      labels: { attr_colour: "Colour: Black" },
    });
  });

  it("resolves two filters together", () => {
    const resolved = resolveAttributeFilters(
      { attr_colour: "white", attr_connectivity: "wireless", q: "speaker" },
      ATTRIBUTES,
    );
    expect(resolved.optionIds.sort()).toEqual(["opt-white", "opt-wireless"]);
    expect(resolved.labels).toEqual({
      attr_colour: "Colour: White",
      attr_connectivity: "Connectivity: Wireless",
    });
  });

  it.each([
    ["an unknown filter slug", { attr_size: "black" }],
    ["an unknown value slug", { attr_colour: "nope" }],
    ["an empty value", { attr_colour: "" }],
    ["a repeated parameter (array)", { attr_colour: ["black", "white"] }],
    ["a value that belongs to a different filter", { attr_connectivity: "black" }],
  ])("resolves nothing for %s", (_label, params) => {
    expect(resolveAttributeFilters(params, ATTRIBUTES)).toEqual({ optionIds: [], labels: {} });
  });
});
