import { describe, expect, it } from "vitest";
import { isCampaignLive } from "@/lib/campaign-liveness";

/**
 * P8.5e (#356) — R5. `isCampaignLive` is the ONE place liveness is decided;
 * `DepartmentHero` and the staff status list both depend on it agreeing with
 * itself, so every combination of the two optional bounds is covered here
 * rather than trusted from reading the implementation once.
 */

const NOW = new Date("2026-08-25T12:00:00Z");
const PAST = new Date("2026-08-01T00:00:00Z");
const FUTURE = new Date("2026-09-01T00:00:00Z");

describe("isCampaignLive", () => {
  it("is live when active with no dates at all", () => {
    expect(isCampaignLive({ isActive: true, startsAt: null, endsAt: null }, NOW)).toBe(true);
  });

  it("is not live when inactive, regardless of dates", () => {
    expect(isCampaignLive({ isActive: false, startsAt: null, endsAt: null }, NOW)).toBe(false);
  });

  it("is not live before its start date", () => {
    expect(isCampaignLive({ isActive: true, startsAt: FUTURE, endsAt: null }, NOW)).toBe(false);
  });

  it("is live once its start date has passed", () => {
    expect(isCampaignLive({ isActive: true, startsAt: PAST, endsAt: null }, NOW)).toBe(true);
  });

  it("is not live after its end date", () => {
    expect(isCampaignLive({ isActive: true, startsAt: null, endsAt: PAST }, NOW)).toBe(false);
  });

  it("is live before its end date", () => {
    expect(isCampaignLive({ isActive: true, startsAt: null, endsAt: FUTURE }, NOW)).toBe(true);
  });

  it("is live when now falls inside both bounds", () => {
    expect(isCampaignLive({ isActive: true, startsAt: PAST, endsAt: FUTURE }, NOW)).toBe(true);
  });

  it("is not live when now falls outside both bounds (already ended)", () => {
    const longAgo = new Date("2026-01-01T00:00:00Z");
    const alsoPast = new Date("2026-02-01T00:00:00Z");
    expect(isCampaignLive({ isActive: true, startsAt: longAgo, endsAt: alsoPast }, NOW)).toBe(
      false,
    );
  });

  it("is not live when now falls outside both bounds (not yet started)", () => {
    const laterStill = new Date("2026-10-01T00:00:00Z");
    expect(isCampaignLive({ isActive: true, startsAt: FUTURE, endsAt: laterStill }, NOW)).toBe(
      false,
    );
  });
});
