import { describe, expect, it } from "vitest";
import { resolveAttributeFilters } from "@/lib/attribute-filters";

/**
 * #912 R19, #918 R22 — `attr_*` params resolve only against the vendor's own filters and values.
 * A list filter may carry several values (one group, any of them); a number filter takes
 * `_min`/`_max` bounds. Labels are keyed by pair (`attr_colour=black`).
 */
const ATTRIBUTES = [
  {
    id: "attr-colour",
    slug: "colour",
    name: "Colour",
    kind: "LIST" as const,
    unit: null,
    options: [
      { id: "opt-black", slug: "black", name: "Black" },
      { id: "opt-white", slug: "white", name: "White" },
    ],
  },
  {
    id: "attr-connectivity",
    slug: "connectivity",
    name: "Connectivity",
    kind: "LIST" as const,
    unit: null,
    options: [{ id: "opt-wireless", slug: "wireless", name: "Wireless" }],
  },
  {
    id: "attr-power",
    slug: "power",
    name: "Power",
    kind: "NUMBER" as const,
    unit: "W",
    options: [],
  },
];

const NOTHING = { optionGroups: [], ranges: [], labels: {} };

describe("resolveAttributeFilters", () => {
  it("resolves a known filter and value", () => {
    expect(resolveAttributeFilters({ attr_colour: "black" }, ATTRIBUTES)).toEqual({
      optionGroups: [["opt-black"]],
      ranges: [],
      labels: { "attr_colour=black": "Colour: Black" },
    });
  });

  it("resolves two filters together, one group each", () => {
    const resolved = resolveAttributeFilters(
      { attr_colour: "white", attr_connectivity: "wireless", q: "speaker" },
      ATTRIBUTES,
    );
    expect(resolved.optionGroups).toEqual([["opt-white"], ["opt-wireless"]]);
    expect(resolved.labels).toEqual({
      "attr_colour=white": "Colour: White",
      "attr_connectivity=wireless": "Connectivity: Wireless",
    });
  });

  it("resolves two values of one filter into ONE group (#918)", () => {
    expect(resolveAttributeFilters({ attr_colour: ["black", "white"] }, ATTRIBUTES)).toEqual({
      optionGroups: [["opt-black", "opt-white"]],
      ranges: [],
      labels: { "attr_colour=black": "Colour: Black", "attr_colour=white": "Colour: White" },
    });
  });

  it("drops an unknown value and keeps the known one", () => {
    expect(resolveAttributeFilters({ attr_colour: ["black", "nope"] }, ATTRIBUTES)).toEqual({
      optionGroups: [["opt-black"]],
      ranges: [],
      labels: { "attr_colour=black": "Colour: Black" },
    });
  });

  it("resolves a min-only range", () => {
    expect(resolveAttributeFilters({ attr_power_min: "15" }, ATTRIBUTES)).toEqual({
      optionGroups: [],
      ranges: [{ attributeId: "attr-power", min: "15" }],
      labels: { "attr_power_min=15": "Power: from 15 W" },
    });
  });

  it("resolves a min and max range into one entry", () => {
    expect(
      resolveAttributeFilters({ attr_power_min: "15", attr_power_max: "65.50" }, ATTRIBUTES),
    ).toEqual({
      optionGroups: [],
      ranges: [{ attributeId: "attr-power", min: "15", max: "65.50" }],
      labels: {
        "attr_power_min=15": "Power: from 15 W",
        "attr_power_max=65.50": "Power: up to 65.5 W",
      },
    });
  });

  it.each([
    ["an unknown filter slug", { attr_size: "black" }],
    ["an unknown value slug", { attr_colour: "nope" }],
    ["an empty value", { attr_colour: "" }],
    ["a value that belongs to a different filter", { attr_connectivity: "black" }],
    ["a bound that fails the number rule", { attr_power_min: "abc" }],
    ["a repeated range bound (array)", { attr_power_min: ["10", "20"] }],
    ["a list key naming a NUMBER filter", { attr_power: "15" }],
    ["a range key naming a LIST filter", { attr_colour_min: "1" }],
  ])("resolves nothing for %s", (_label, params) => {
    expect(resolveAttributeFilters(params, ATTRIBUTES)).toEqual(NOTHING);
  });
});
