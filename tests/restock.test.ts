import { describe, expect, it } from "vitest";
import { currentRestockDay, formatRestockDay, restockDayFromStored } from "@/lib/restock";

/**
 * #876 (R10). The helpers work on `YYYY-MM-DD` labels only, so their output must not depend on the
 * process timezone. validation.md re-runs this file under two extreme TZ values to prove that.
 */
describe("currentRestockDay", () => {
  const today = "2026-09-23";

  it("hides a day that has passed", () => {
    expect(currentRestockDay("2026-09-22", today)).toBeNull();
  });

  it("keeps today", () => {
    expect(currentRestockDay("2026-09-23", today)).toBe("2026-09-23");
  });

  it("keeps tomorrow", () => {
    expect(currentRestockDay("2026-09-24", today)).toBe("2026-09-24");
  });

  it("returns null for no day", () => {
    expect(currentRestockDay(null, today)).toBeNull();
  });

  it("compares across a month and year boundary", () => {
    expect(currentRestockDay("2027-01-01", "2026-12-31")).toBe("2027-01-01");
    expect(currentRestockDay("2026-12-31", "2027-01-01")).toBeNull();
  });
});

describe("formatRestockDay", () => {
  it("formats the label's own day, weekday first", () => {
    const text = formatRestockDay("2026-09-28");
    expect(text).toContain("Mon");
    expect(text).toContain("28");
  });

  it("does not shift a day at either end of the UTC range", () => {
    // Stored at UTC midnight: a zone-dependent formatter would render these as the 31st/2nd.
    expect(formatRestockDay("2026-01-01")).toContain("1");
    expect(formatRestockDay("2026-01-01")).toContain("Thu");
  });
});

describe("restockDayFromStored", () => {
  it("reads a stored UTC midnight back as its own day", () => {
    expect(restockDayFromStored(new Date("2026-09-28T00:00:00.000Z"))).toBe("2026-09-28");
  });

  it("maps absent to null", () => {
    expect(restockDayFromStored(null)).toBeNull();
    expect(restockDayFromStored(undefined)).toBeNull();
  });
});
