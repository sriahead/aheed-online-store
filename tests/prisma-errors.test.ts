import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";

/**
 * P8.5c `/fix` (2026-08-25, #347) — `/validate` found this predicate checked
 * only Prisma's normalised `P2002`, missing the raw Postgres SQLSTATE `23505`
 * that `getPrisma()`'s HTTP adapter (`PrismaNeonHttp`) throws for the exact
 * same underlying constraint violation `getPrismaWs()`'s WebSocket adapter
 * throws as `P2002`. A duplicate-slug bundle create 500ed live because of this.
 */
describe("isUniqueViolation", () => {
  it("recognises Prisma's normalised P2002 code (the WebSocket adapter's shape)", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
  });

  it("recognises the raw Postgres SQLSTATE 23505 (the HTTP adapter's shape)", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("is false for an unrelated Prisma error code", () => {
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
  });

  it("is false for a numeric code (SQLSTATE is always a string)", () => {
    expect(isUniqueViolation({ code: 23505 })).toBe(false);
  });

  it("is false for non-error values", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("some string")).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
  });
});
