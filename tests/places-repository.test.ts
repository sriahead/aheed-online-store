import { describe, expect, it } from "vitest";
import {
  MAX_STREET_SUGGESTIONS,
  SUGGESTION_DENSITY_CEILING,
  SUGGESTION_NEAREST_MAX_METRES,
  SUGGESTION_RADIUS_METRES,
  rankNearbyStreets,
  resolveLocality,
  type PlaceReferenceRow,
} from "@/lib/repositories/places";

/**
 * Street-suggestion ranking and suppression (#764).
 *
 * The rule being protected is "no hint rather than a misleading one". These coordinates are in
 * British National Grid metres, so a 250-unit offset really is 250 metres — the property that lets
 * the whole thing be plain arithmetic.
 */

const ORIGIN = { eastings: 484857, northings: 238851 };

function road(
  name: string,
  metresEast: number,
  extra: Partial<PlaceReferenceRow> = {},
): PlaceReferenceRow {
  // prettier-ignore
  return {
    name,
    type: "transportNetwork",
    localType: "Named Road",
    eastings: ORIGIN.eastings + metresEast,
    northings: ORIGIN.northings,
    populatedPlace: "Milton Keynes",
    districtBorough: "Milton Keynes",
    countyUnitary: "Milton Keynes",
    region: "South East",
    country: "England",
    ...extra,
  };
}

function settlement(name: string, metresEast: number): PlaceReferenceRow {
  return road(name, metresEast, { type: "populatedPlace", localType: "Town" });
}

const rank = (places: PlaceReferenceRow[]) =>
  rankNearbyStreets(places, ORIGIN.eastings, ORIGIN.northings);

describe("rankNearbyStreets", () => {
  it("returns the nearest roads, closest first", () => {
    const result = rank([road("Far Street", 150), road("Near Street", 20), road("Mid Street", 80)]);

    expect(result).toEqual(["Near Street", "Mid Street", "Far Street"]);
  });

  it(`returns at most ${MAX_STREET_SUGGESTIONS} names`, () => {
    const result = rank([10, 20, 30, 40, 50].map((d) => road(`Street ${d}`, d)));

    expect(result).toHaveLength(MAX_STREET_SUGGESTIONS);
    expect(result).toEqual(["Street 10", "Street 20", "Street 30"]);
  });

  it("deduplicates a road split into several sections, keeping its closest point", () => {
    // Open Names splits long roads into "Section Of Named Road" records, so the same name
    // legitimately appears more than once inside the radius.
    const result = rank([
      road("Midsummer Boulevard", 120, { localType: "Section Of Named Road" }),
      road("Midsummer Boulevard", 30, { localType: "Section Of Named Road" }),
      road("Silbury Boulevard", 60),
    ]);

    expect(result).toEqual(["Midsummer Boulevard", "Silbury Boulevard"]);
  });

  it("ignores anything that is not a road", () => {
    const result = rank([settlement("Milton Keynes", 5), road("Real Street", 100)]);

    expect(result).toEqual(["Real Street"]);
  });

  it("ignores a road with no name", () => {
    expect(rank([road("   ", 10), road("Named Street", 50)])).toEqual(["Named Street"]);
  });

  describe("suppression — no hint rather than a misleading one", () => {
    it("returns nothing when no road qualifies at all", () => {
      expect(rank([])).toEqual([]);
      expect(rank([settlement("Milton Keynes", 10)])).toEqual([]);
    });

    it("excludes a road beyond the radius", () => {
      const justOutside = SUGGESTION_RADIUS_METRES + 10;
      expect(rank([road("Inside", 100), road("Outside", justOutside)])).toEqual(["Inside"]);
    });

    it("discards the corner of the bounding box, which is further than the radius", () => {
      // The database can only be asked for the enclosing square; its corners reach 354m, so this
      // refinement is what makes the 250m rule actually true.
      const corner: PlaceReferenceRow = {
        ...road("Corner Street", 0),
        eastings: ORIGIN.eastings + 250,
        northings: ORIGIN.northings + 250,
      };

      expect(rank([corner])).toEqual([]);
    });

    it(`returns nothing when the nearest road is beyond ${SUGGESTION_NEAREST_MAX_METRES}m`, () => {
      // A single road, far away, presented confidently is the most misleading output this feature
      // could produce. A real example: MK17 9AE has exactly one road within 250m, at 213m.
      const result = rank([road("Galley Lane", SUGGESTION_NEAREST_MAX_METRES + 13)]);

      expect(result).toEqual([]);
    });

    it("keeps a road exactly at the nearest-distance limit", () => {
      expect(rank([road("Borderline Road", SUGGESTION_NEAREST_MAX_METRES)])).toEqual([
        "Borderline Road",
      ]);
    });

    it(`returns nothing when more than ${SUGGESTION_DENSITY_CEILING} distinct names are in range`, () => {
      const crowded = Array.from({ length: SUGGESTION_DENSITY_CEILING + 1 }, (_, i) =>
        road(`Street ${i}`, 10 + i),
      );

      expect(rank(crowded)).toEqual([]);
    });

    it(`still answers at exactly ${SUGGESTION_DENSITY_CEILING} distinct names`, () => {
      const atCeiling = Array.from({ length: SUGGESTION_DENSITY_CEILING }, (_, i) =>
        road(`Street ${i}`, 10 + i),
      );

      expect(rank(atCeiling)).toHaveLength(MAX_STREET_SUGGESTIONS);
    });

    it("counts DISTINCT names against the ceiling, not rows", () => {
      // 30 rows but three roads: a road split into many sections must not trip the density rule.
      const sections = Array.from({ length: 30 }, (_, i) =>
        road(["Alpha Road", "Beta Road", "Gamma Road"][i % 3], 10 + i),
      );

      expect(rank(sections)).toEqual(["Alpha Road", "Beta Road", "Gamma Road"]);
    });
  });
});

describe("resolveLocality", () => {
  const locality = (places: PlaceReferenceRow[]) =>
    resolveLocality(places, ORIGIN.eastings, ORIGIN.northings);

  it("prefers a settlement's own name as the town", () => {
    const result = locality([road("Silbury Boulevard", 10), settlement("Milton Keynes", 200)]);

    expect(result.town).toBe("Milton Keynes");
  });

  it("falls back to a road's populatedPlace when no settlement is nearby", () => {
    // Code-Point supplies administrative CODES only, so without this the API would report a
    // location no shopper could read.
    const result = locality([road("Silbury Boulevard", 10)]);

    expect(result.town).toBe("Milton Keynes");
  });

  it("reads district and county from whichever record carries them", () => {
    const result = locality([
      road("Nameless Lane", 10, { districtBorough: null, countyUnitary: null }),
      road("Silbury Boulevard", 80, { districtBorough: "Dacorum", countyUnitary: "Hertfordshire" }),
    ]);

    expect(result.district).toBe("Dacorum");
    expect(result.county).toBe("Hertfordshire");
  });

  it("returns nulls rather than inventing a place when there is nothing nearby", () => {
    expect(locality([])).toEqual({ town: null, district: null, county: null });
  });

  it("does not treat an empty string as a usable name", () => {
    const result = locality([road("Some Road", 10, { populatedPlace: "  ", countyUnitary: "" })]);

    expect(result.town).toBeNull();
    expect(result.county).toBeNull();
  });
});
