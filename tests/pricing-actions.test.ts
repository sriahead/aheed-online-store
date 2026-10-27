import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** #1309 R22: the two refresh actions are platform-admin only and take no URL. */

const requireVendorRole = vi.fn();
const runPricingRefresh = vi.fn();

vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole }));
vi.mock("@/lib/pricing-refresh-service", () => ({ runPricingRefresh }));

const FILE = "app/(admin)/staff/platform/costs/actions.ts";

beforeEach(() => {
  requireVendorRole.mockReset();
  runPricingRefresh.mockReset();
  runPricingRefresh.mockResolvedValue({
    scope: "costs",
    ranAt: "x",
    sources: [],
    recommendations: null,
  });
});

async function actions() {
  return import("@/app/(admin)/staff/platform/costs/actions");
}

describe("platform admin", () => {
  it("runs the costs refresh for the signed-in host's vendor", async () => {
    requireVendorRole.mockResolvedValue({ ok: true, via: "platform-admin", vendorId: "v1" });
    const result = await (await actions()).refreshCostsAction();
    expect(result.ok).toBe(true);
    expect(runPricingRefresh).toHaveBeenCalledWith("v1", "costs");
    expect(requireVendorRole).toHaveBeenCalledWith("ADMIN");
  });

  it("runs the full refresh for Refresh Recommendations", async () => {
    requireVendorRole.mockResolvedValue({ ok: true, via: "platform-admin", vendorId: "v1" });
    await (await actions()).refreshRecommendationsAction();
    expect(runPricingRefresh).toHaveBeenCalledWith("v1", "all");
  });
});

describe.each([
  ["vendor ADMIN", { ok: true, via: "ADMIN", vendorId: "v1" }],
  ["vendor STAFF", { ok: false, status: 403, reason: "forbidden" }],
  ["unauthenticated", { ok: false, status: 401, reason: "unauthenticated" }],
])("%s", (_label, auth) => {
  it("is refused and the service is never called", async () => {
    requireVendorRole.mockResolvedValue(auth);
    const mod = await actions();
    expect(await mod.refreshCostsAction()).toEqual({ ok: false, error: "Platform admin only" });
    expect(await mod.refreshRecommendationsAction()).toEqual({
      ok: false,
      error: "Platform admin only",
    });
    expect(runPricingRefresh).not.toHaveBeenCalled();
  });
});

describe("the module", () => {
  const source = readFileSync(FILE, "utf8");

  it('starts with "use server" and exports only async functions', () => {
    expect(source.split("\n")[0]).toBe('"use server";');
    const exports = source.match(/^export .*/gm) ?? [];
    expect(exports.length).toBe(2);
    for (const line of exports) expect(line).toMatch(/^export async function \w+\(\)/);
  });
});
