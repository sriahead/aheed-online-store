import { describe, expect, it } from "vitest";
import {
  MAX_POSTCODE_INPUT_LENGTH,
  formatPostcode,
  isValidPostcodeShape,
  normalisePostcode,
  postcodeAreaOf,
  postcodeDistrictOf,
} from "@/lib/postcode-normalisation";

describe("normalisePostcode", () => {
  it.each([
    ["mk9 2nw", "MK92NW"],
    [" MK9  2NW ", "MK92NW"],
    ["MK92NW", "MK92NW"],
    ["Mk9\t2Nw", "MK92NW"],
  ])("normalises %j to %j", (input, expected) => {
    expect(normalisePostcode(input)).toBe(expected);
  });

  it("leaves an empty string empty rather than throwing", () => {
    expect(normalisePostcode("")).toBe("");
  });
});

describe("formatPostcode", () => {
  it.each([
    ["MK92NW", "MK9 2NW"],
    ["mk92nw", "MK9 2NW"],
    ["SW1A1AA", "SW1A 1AA"],
    ["B331AA", "B33 1AA"],
  ])("formats %j as %j", (input, expected) => {
    // The inward code is always three characters, so the space always falls three
    // from the end whether the outward code is two, three or four long.
    expect(formatPostcode(input)).toBe(expected);
  });

  it("returns short input unchanged rather than mangling it", () => {
    expect(formatPostcode("MK9")).toBe("MK9");
  });
});

describe("isValidPostcodeShape", () => {
  it.each(["MK9 2NW", "SW1A 1AA", "B33 1AA", "EC1A 1BB", "W1A 0AX", "DN55 1PT"])(
    "accepts the well-formed postcode %j",
    (input) => {
      expect(isValidPostcodeShape(input)).toBe(true);
    },
  );

  it.each(["", "NOTAPOSTCODE", "MK9", "2NW", "MK9 2N", "1K9 2NW", "MK9 2N1", "!!!"])(
    "rejects the malformed input %j",
    (input) => {
      expect(isValidPostcodeShape(input)).toBe(false);
    },
  );

  it("rejects an over-long input before regex work, so the API cannot be fed bulk text", () => {
    const huge = "M".repeat(MAX_POSTCODE_INPUT_LENGTH + 1);
    expect(isValidPostcodeShape(huge)).toBe(false);
  });

  it("says nothing about whether the postcode exists", () => {
    // ZZ99 9ZZ is well-formed and is not a real postcode. Shape and existence are
    // different questions, answered by different things; conflating them is what
    // this assertion pins down.
    expect(isValidPostcodeShape("ZZ99 9ZZ")).toBe(true);
  });
});

describe("postcodeDistrictOf", () => {
  it.each([
    ["MK92NW", "MK9"],
    ["MK9 2NW", "MK9"],
    ["SW1A1AA", "SW1A"],
    ["B331AA", "B33"],
    ["MK178NL", "MK17"],
  ])("reads the district of %j as %j", (input, expected) => {
    expect(postcodeDistrictOf(input)).toBe(expected);
  });

  it.each(["NOTAPOSTCODE", "", "MK9"])("returns null for the unparseable input %j", (input) => {
    expect(postcodeDistrictOf(input)).toBeNull();
  });
});

describe("postcodeAreaOf", () => {
  it.each([
    ["MK92NW", "MK"],
    ["SW1A1AA", "SW"],
    ["B331AA", "B"],
  ])("reads the area of %j as %j", (input, expected) => {
    expect(postcodeAreaOf(input)).toBe(expected);
  });

  it.each(["NOTAPOSTCODE", ""])("returns null for the unparseable input %j", (input) => {
    expect(postcodeAreaOf(input)).toBeNull();
  });

  it("distinguishes MK17 from MK9, which is the whole point of #613's granularity", () => {
    expect(postcodeDistrictOf("MK178NL")).toBe("MK17");
    expect(postcodeDistrictOf("MK92NW")).toBe("MK9");
    expect(postcodeAreaOf("MK178NL")).toBe("MK");
    expect(postcodeAreaOf("MK92NW")).toBe("MK");
  });
});
