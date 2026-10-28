import { describe, expect, it } from "vitest";
import { isRouteActive } from "@/components/staff/PanelNav";

describe("PanelNav isRouteActive (#1319)", () => {
  it("matches the two section homes exactly", () => {
    expect(isRouteActive("/staff", "/staff")).toBe(true);
    expect(isRouteActive("/staff", "/staff/orders")).toBe(false);
    expect(isRouteActive("/staff/platform", "/staff/platform")).toBe(true);
    expect(isRouteActive("/staff/platform", "/staff/platform/costs")).toBe(false);
  });

  it("prefix-matches every other link", () => {
    expect(isRouteActive("/staff/platform/costs", "/staff/platform/costs")).toBe(true);
    expect(isRouteActive("/staff/platform/costs", "/staff/platform/costs/export")).toBe(true);
    expect(isRouteActive("/staff/orders", "/staff/orders/123")).toBe(true);
  });
});
