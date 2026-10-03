import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorRoleMock, updateConfigMock, revalidatePathMock } = vi.hoisted(() => ({
  requireVendorRoleMock: vi.fn(),
  updateConfigMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: requireVendorRoleMock }));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock, revalidateTag: vi.fn() }));
vi.mock("@/lib/vendor-service", () => ({
  updateVendorStorefrontConfig: updateConfigMock,
  applyVendorTheme: vi.fn(),
  updateVendorLogoKey: vi.fn(),
}));

import { updateProductGridDensity } from "@/features/admin/storefront";
import { initialProductGridDensityState } from "@/lib/product-grid-density";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

/** #962 — the write path. The refusal case lives in tests/admin-only-authorization.test.ts. */
describe("updateProductGridDensity", () => {
  beforeEach(() => {
    updateConfigMock.mockReset();
    revalidatePathMock.mockReset();
    requireVendorRoleMock.mockReset();
    requireVendorRoleMock.mockResolvedValue({ ok: true, vendorId: "vendor-from-session" });
  });

  it("writes only the preset, for the session's vendor, and revalidates both paths", async () => {
    const result = await updateProductGridDensity(
      initialProductGridDensityState,
      form({ productGridDensity: "SPACIOUS", vendorId: "someone-else" }),
    );

    expect(result).toEqual({ error: null, saved: true });
    expect(requireVendorRoleMock).toHaveBeenCalledWith("ADMIN");
    expect(updateConfigMock).toHaveBeenCalledTimes(1);
    expect(updateConfigMock).toHaveBeenCalledWith("vendor-from-session", {
      productGridDensity: "SPACIOUS",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/staff/storefront");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it.each([[""], ["standard"], ["WIDE"]])("refuses %j without writing", async (value) => {
    const result = await updateProductGridDensity(
      initialProductGridDensityState,
      form({ productGridDensity: value }),
    );

    expect(result.saved).toBe(false);
    expect(result.error).toBeTruthy();
    expect(updateConfigMock).not.toHaveBeenCalled();
  });

  it("refuses a submission with no preset at all without writing", async () => {
    const result = await updateProductGridDensity(initialProductGridDensityState, new FormData());

    expect(result.saved).toBe(false);
    expect(updateConfigMock).not.toHaveBeenCalled();
  });
});
