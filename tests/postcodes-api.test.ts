import { describe, it, expect } from "vitest";
import { lookupPostcode, PostcodeNotFoundError, PostcodeApiError } from "../lib/postcodes-api";

describe("lookupPostcode", () => {
  it("successfully fetches and maps a valid postcode", async () => {
    const result = await lookupPostcode("SW1A 1AA");
    expect(result.postcode).toBe("SW1A 1AA");
    expect(result.admin_district).toBe("Westminster");
    // admin_county might be null for London, which is fine, we just want to ensure it doesn't throw.
  });

  it("throws PostcodeNotFoundError for an invalid postcode (404)", async () => {
    await expect(lookupPostcode("XX99 9XX")).rejects.toThrow(PostcodeNotFoundError);
  });
});
