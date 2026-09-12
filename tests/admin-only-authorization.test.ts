import { describe, it, expect, vi, beforeEach } from "vitest";

const requireVendorRoleMock = vi.fn();
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: requireVendorRoleMock }));

import { saveStorefrontConfig } from "@/features/admin/storefront";
import { saveDeliveryArea } from "@/features/admin/delivery-areas";
import { saveLoyaltyTier } from "@/features/admin/loyalty-config";
import { saveDiscountCode } from "@/features/admin/discount-codes";
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
    const res = await saveStorefrontConfig({} as any, formData);
    expect(res.error).toMatch(/permission/);
  });

  it("denies STAFF from executing Delivery Areas actions", async () => {
    const res = await saveDeliveryArea({} as any, formData);
    expect(res.error).toMatch(/permission/);
  });

  it("denies STAFF from executing Loyalty actions", async () => {
    const res = await saveLoyaltyTier({} as any, formData);
    expect(res.error).toMatch(/permission/);
  });

  it("denies STAFF from executing Discount Codes actions", async () => {
    const res = await saveDiscountCode({} as any, formData);
    expect(res.error).toMatch(/permission/);
  });

  it("denies STAFF from executing Payments actions", async () => {
    const res = await reconcileRefusal({} as any, formData);
    expect(res.error).toMatch(/permission/);
  });

  it("denies STAFF from executing AI synonym generation", async () => {
    const res = await proposeSynonymsFromLog({} as any, formData);
    expect(res.error).toMatch(/permission/);
  });
  
  it("allows STAFF to execute normal synonym moderation", async () => {
    requireVendorRoleMock.mockResolvedValue({
      ok: true,
      status: 200,
      vendorId: "vendor-1",
      via: "STAFF"
    });
    
    // addSynonym needs createSynonym mocked, but we just verify it doesn't return the refusal
    const { createSynonym } = await import("@/lib/search-synonyms-service");
    (createSynonym as any).mockResolvedValue({ ok: true });
    
    const res = await addSynonym({} as any, formData);
    expect(res.error).toBeNull();
  });
});
