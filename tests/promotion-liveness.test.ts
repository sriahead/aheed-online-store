import { describe, expect, it } from "vitest";
import { isPromotionLive } from "@/lib/promotion-liveness";

const NOW = new Date("2026-11-04T12:00:00Z");
const PAST = new Date("2026-11-01T00:00:00Z");
const FUTURE = new Date("2026-11-10T00:00:00Z");

describe("isPromotionLive (R5)", () => {
  it("is live when active with no scheduling dates", () => {
    expect(isPromotionLive({ isActive: true, startsAt: null, endsAt: null }, NOW)).toBe(true);
  });

  it("is not live when inactive regardless of dates", () => {
    expect(isPromotionLive({ isActive: false, startsAt: null, endsAt: null }, NOW)).toBe(false);
    expect(isPromotionLive({ isActive: false, startsAt: PAST, endsAt: FUTURE }, NOW)).toBe(false);
  });

  it("is not live before its start date", () => {
    expect(isPromotionLive({ isActive: true, startsAt: FUTURE, endsAt: null }, NOW)).toBe(false);
  });

  it("is live once start date has passed", () => {
    expect(isPromotionLive({ isActive: true, startsAt: PAST, endsAt: null }, NOW)).toBe(true);
  });

  it("is not live after its end date", () => {
    expect(isPromotionLive({ isActive: true, startsAt: null, endsAt: PAST }, NOW)).toBe(false);
  });

  it("is live before its end date", () => {
    expect(isPromotionLive({ isActive: true, startsAt: null, endsAt: FUTURE }, NOW)).toBe(true);
  });

  it("is live when now falls between start and end dates", () => {
    expect(isPromotionLive({ isActive: true, startsAt: PAST, endsAt: FUTURE }, NOW)).toBe(true);
  });

  it("is not live when now falls outside both dates", () => {
    const expiredStart = new Date("2026-09-01T00:00:00Z");
    const expiredEnd = new Date("2026-09-10T00:00:00Z");
    expect(
      isPromotionLive({ isActive: true, startsAt: expiredStart, endsAt: expiredEnd }, NOW),
    ).toBe(false);

    const futureStart = new Date("2026-12-01T00:00:00Z");
    const futureEnd = new Date("2026-12-10T00:00:00Z");
    expect(isPromotionLive({ isActive: true, startsAt: futureStart, endsAt: futureEnd }, NOW)).toBe(
      false,
    );
  });
});
