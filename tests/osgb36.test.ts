import { describe, expect, it } from "vitest";
import { eastingsNorthingsToWgs84, gridDistanceMetres } from "@/lib/osgb36";

/**
 * Reference points for #764's coordinate conversion.
 *
 * Every row is a REAL published pairing of a British National Grid coordinate and
 * its WGS84 position, captured from an independent source rather than produced by
 * the implementation being tested — which is the whole point. A fixture generated
 * by the code under test would agree with any bug that code happened to contain.
 *
 * They are spread deliberately: Edinburgh and Newcastle are far north, Cardiff is
 * far west, London is near the grid's true origin, and Milton Keynes is the
 * vendor's own area. A transverse Mercator error grows with distance from the
 * central meridian, so a set clustered in one place would hide exactly the defect
 * this test exists to catch.
 */
const REFERENCE_POINTS = [
  { name: "EH1 1YZ (Edinburgh)", eastings: 325597, northings: 673676, latitude: 55.950328, longitude: -3.193018 }, // prettier-ignore
  { name: "NE1 7RU (Newcastle)", eastings: 424693, northings: 565147, latitude: 54.980327, longitude: -1.615727 }, // prettier-ignore
  { name: "CF10 1EP (Cardiff)", eastings: 318200, northings: 175860, latitude: 51.475764, longitude: -3.179217 }, // prettier-ignore
  { name: "SW1A 1AA (London)", eastings: 529090, northings: 179645, latitude: 51.50101, longitude: -0.141563 }, // prettier-ignore
  { name: "MK17 8NL (Milton Keynes)", eastings: 493197, northings: 235519, latitude: 52.010298, longitude: -0.64353 }, // prettier-ignore
] as const;

/**
 * One degree of latitude is about 111,320 m; one degree of longitude shrinks with
 * the cosine of latitude, and roughly 65,000 m is a safe floor across Great
 * Britain. Converting the tolerance into degrees this way keeps the assertion
 * stated in the unit the requirement is stated in — metres — rather than in an
 * arbitrary decimal-place count that means different distances north and south.
 */
const TOLERANCE_METRES = 10;
const METRES_PER_DEGREE_LAT = 111_320;
const MIN_METRES_PER_DEGREE_LON = 65_000;

describe("eastingsNorthingsToWgs84", () => {
  it.each(REFERENCE_POINTS)(
    "converts $name to within 10 metres of its published WGS84 position",
    ({ eastings, northings, latitude, longitude }) => {
      const result = eastingsNorthingsToWgs84(eastings, northings);

      const latErrorMetres = Math.abs(result.latitude - latitude) * METRES_PER_DEGREE_LAT;
      const lonErrorMetres = Math.abs(result.longitude - longitude) * MIN_METRES_PER_DEGREE_LON;

      expect(latErrorMetres).toBeLessThanOrEqual(TOLERANCE_METRES);
      expect(lonErrorMetres).toBeLessThanOrEqual(TOLERANCE_METRES);
    },
  );

  it("returns degrees, not grid units", () => {
    // Guards the mistake that would otherwise be invisible in an API response:
    // passing eastings/northings straight through. Any GB latitude is 49..61 and
    // any GB longitude is -9..2, so a six-figure value is unmistakably wrong.
    const result = eastingsNorthingsToWgs84(529090, 179645);

    expect(result.latitude).toBeGreaterThan(49);
    expect(result.latitude).toBeLessThan(61);
    expect(result.longitude).toBeGreaterThan(-9);
    expect(result.longitude).toBeLessThan(2);
  });

  it("rounds to six decimal places so no false precision reaches the API", () => {
    const result = eastingsNorthingsToWgs84(493197, 235519);

    expect(result.latitude.toString()).toMatch(/^-?\d+(\.\d{1,6})?$/);
    expect(result.longitude.toString()).toMatch(/^-?\d+(\.\d{1,6})?$/);
  });
});

describe("gridDistanceMetres", () => {
  it("is zero for a point against itself", () => {
    expect(gridDistanceMetres(493197, 235519, 493197, 235519)).toBe(0);
  });

  it("measures a pure easting offset in metres", () => {
    // The grid is metric and planar, which is the property the proximity join
    // depends on — 250 units east really is 250 metres east.
    expect(gridDistanceMetres(493197, 235519, 493447, 235519)).toBe(250);
  });

  it("measures a diagonal with Pythagoras", () => {
    expect(gridDistanceMetres(0, 0, 300, 400)).toBe(500);
  });

  it("is symmetric", () => {
    const forward = gridDistanceMetres(325597, 673676, 424693, 565147);
    const back = gridDistanceMetres(424693, 565147, 325597, 673676);
    expect(forward).toBe(back);
  });

  it("puts the corner of a 250m bounding box beyond a 250m radius", () => {
    // Exactly why the repository's box query cannot be the final answer: the
    // corner of the square is 353m away, so a pure bounding-box filter would
    // return streets the radius rule must reject.
    const corner = gridDistanceMetres(0, 0, 250, 250);
    expect(corner).toBeGreaterThan(250);
    expect(Math.round(corner)).toBe(354);
  });
});
