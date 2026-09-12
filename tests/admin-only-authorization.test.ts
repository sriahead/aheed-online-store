import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorRoleMock } = vi.hoisted(() => ({ requireVendorRoleMock: vi.fn() }));
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: requireVendorRoleMock }));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { updateStorefrontConfig } from "@/features/admin/storefront";
import { addDeliveryArea } from "@/features/admin/delivery-areas";
import { saveLoyaltyConfig } from "@/features/admin/loyalty-config";
import { createDiscountCode } from "@/features/admin/discount-codes";
import { reconcileRefusal } from "@/features/payments/reconcile-refusal";
import { proposeSynonymsFromLog } from "@/features/admin/search-synonyms";
import { addSynonym } from "@/features/admin/search-synonyms";

vi.mock("@/lib/search-synonyms-service", () => ({
  createSynonym: vi.fn(),
}));

describe("Admin-only Server Actions", () => {
  beforeEach(() => {
    requireVendorRoleMock.mockReset();
    requireVendorRoleMock.mockResolvedValue({
      ok: false,
      status: 403,
      reason: "forbidden",
      vendorId: "vendor-1",
      user: { role: "CUSTOMER" },
    }); // Simulated rejection because mock requires ADMIN but we act like a STAFF
  });

  const formData = new FormData();

  it("denies STAFF from executing Storefront actions", async () => {
    const res = await updateStorefrontConfig({} as any, formData);
    expect(res.error).toMatch(/permission/i);
  });

  it("denies STAFF from executing Delivery Areas actions", async () => {
    const res = await addDeliveryArea({} as any, formData);
    expect(res.error).toMatch(/permission/i);
  });

  it("denies STAFF from executing Loyalty actions", async () => {
    const res = await saveLoyaltyConfig({} as any, formData);
    expect(res.error).toMatch(/permission/i);
  });

  it("denies STAFF from executing Discount Codes actions", async () => {
    const res = await createDiscountCode({} as any, formData);
    expect(res.error).toMatch(/permission/i);
  });

  it("denies STAFF from executing Payments actions", async () => {
    const res = await reconcileRefusal(formData);
    expect(res).toBeUndefined();
  });

  it("denies STAFF from executing AI synonym generation", async () => {
    const res = await proposeSynonymsFromLog({} as any, formData);
    expect(res.error).toMatch(/permission/i);
  });

  it("allows STAFF to execute normal synonym moderation", async () => {
    requireVendorRoleMock.mockResolvedValue({
      ok: true,
      status: 200,
      vendorId: "vendor-1",
      via: "STAFF",
    });

    // addSynonym needs createSynonym mocked, but we just verify it doesn't return the refusal
    const { createSynonym } = await import("@/lib/search-synonyms-service");
    (createSynonym as any).mockResolvedValue({ ok: true });

    const res = await addSynonym({} as any, formData);
    expect(res.error).toBeNull();
  });
});
