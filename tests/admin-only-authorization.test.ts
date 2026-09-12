import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorRoleMock } = vi.hoisted(() => ({ requireVendorRoleMock: vi.fn() }));
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: requireVendorRoleMock }));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import {
  updateStorefrontConfig,
  updateDeliveryRules,
  updateSocialContact,
  applyStorefrontTheme,
  saveStorefrontTheme,
} from "@/features/admin/storefront";
import { addDeliveryArea, removeDeliveryArea } from "@/features/admin/delivery-areas";
import { saveLoyaltyConfig } from "@/features/admin/loyalty-config";
import { createDiscountCode, deactivateDiscountCode } from "@/features/admin/discount-codes";
import { reconcileRefusal, recoverRefusedOrder } from "@/features/payments/reconcile-refusal";
import { proposeSynonymsFromLog, addSynonym } from "@/features/admin/search-synonyms";
import { saveProduct, saveCategory } from "@/features/admin/catalogue";
import { createBrand } from "@/features/admin/brands";
import { saveBundle } from "@/features/admin/bundles";

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

    const resRules = await updateDeliveryRules({} as any, formData);
    expect(resRules.error).toMatch(/permission/i);

    const resSocial = await updateSocialContact({} as any, formData);
    expect(resSocial.error).toMatch(/permission/i);

    const resTheme = await applyStorefrontTheme("theme-1");
    expect(resTheme.error).toMatch(/permission/i);

    const resSaveTheme = await saveStorefrontTheme("Theme", {} as any);
    expect(resSaveTheme.error).toMatch(/permission/i);
  });

  it("denies STAFF from executing Delivery Areas actions", async () => {
    const resAdd = await addDeliveryArea({} as any, formData);
    expect(resAdd.error).toMatch(/permission/i);

    const resRemove = await removeDeliveryArea({} as any, formData);
    expect(resRemove.error).toMatch(/permission/i);
  });

  it("denies STAFF from executing Loyalty actions", async () => {
    const res = await saveLoyaltyConfig({} as any, formData);
    expect(res.error).toMatch(/permission/i);
  });

  it("denies STAFF from executing Discount Codes actions", async () => {
    const res = await createDiscountCode({} as any, formData);
    expect(res.error).toMatch(/permission/i);

    const resDeact = await deactivateDiscountCode({} as any, formData);
    expect(resDeact.error).toMatch(/permission/i);
  });

  it("denies STAFF from executing Payments actions", async () => {
    const res = await reconcileRefusal(formData);
    expect(res).toBeUndefined();

    const resRecover = await recoverRefusedOrder(formData);
    expect(resRecover).toBeUndefined();
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

describe("Cross-vendor isolation on STAFF-delegated functionality (V3 / R5)", () => {
  beforeEach(() => {
    requireVendorRoleMock.mockReset();
    // Simulate a STAFF user of Vendor A attempting to invoke actions across the boundary of Vendor B:
    // requireVendorRole returns 403 forbidden because user has no membership for Vendor B
    requireVendorRoleMock.mockResolvedValue({
      ok: false,
      status: 403,
      reason: "forbidden",
      vendorId: "vendor-b",
    });
  });

  const formData = new FormData();

  it("denies cross-vendor mutations on products, categories, brands, bundles, and synonyms", async () => {
    const productRes = await saveProduct({} as any, formData);
    expect(productRes.error).toMatch(/permission/i);

    const categoryRes = await saveCategory({} as any, formData);
    expect(categoryRes.error).toMatch(/permission/i);

    const brandRes = await createBrand({} as any, formData);
    expect(brandRes.error).toMatch(/permission/i);

    const bundleRes = await saveBundle({} as any, formData);
    expect(bundleRes.error).toMatch(/permission/i);

    const synonymRes = await addSynonym({} as any, formData);
    expect(synonymRes.error).toMatch(/permission/i);
  });
});
