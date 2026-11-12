import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The landing hero showed only 3 of 7 live promotions (2026-11-12): the storefront read defaulted
 * to `limit = 3`. Read as source, because importing the service pulls in the request context.
 */
describe("landing-page promotions limit", () => {
  const service = readFileSync("lib/promotions-service.ts", "utf8");
  const landing = readFileSync("app/(landing)/page.tsx", "utf8");

  it("defaults the storefront read to HERO_PROMOTION_LIMIT, which is well above 3", () => {
    const limit = Number(/export const HERO_PROMOTION_LIMIT = (\d+);/.exec(service)?.[1]);
    expect(limit).toBeGreaterThanOrEqual(10);
    expect(service).toContain("limit = HERO_PROMOTION_LIMIT");
    expect(service).not.toMatch(/limit = 3\b/);
  });

  it("the landing page does not pass its own smaller limit", () => {
    expect(landing).toContain("getLivePromotionsForStorefront()");
  });
});
