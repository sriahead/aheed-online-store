import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT_PLATFORM_BRANDING_TERMINOLOGY,
  DEFAULT_PLATFORM_URL,
} from "@/lib/platform-defaults";
import {
  updateVendorPlatformBranding,
  applyPlatformBrandingToAllVendors,
} from "@/lib/repositories/vendor";
import { getBrandingSectionData, savePlatformBranding } from "@/lib/client-setup-service";
import { createStripePaymentService } from "@/lib/payments";
import { renderEmail } from "@/lib/email/layout/render";
import { fallbackBrand } from "@/lib/email/layout/fallback";

describe("Platform Branding Terminology (#1585)", () => {
  it("defines Levelled Up by Merqify as the platform-wide default", () => {
    expect(DEFAULT_PLATFORM_BRANDING_TERMINOLOGY).toBe("Levelled Up by Merqify");
  });

  describe("Repository Layer", () => {
    it("updateVendorPlatformBranding updates a single vendor config", async () => {
      const updateMock = vi.fn().mockResolvedValue({});
      const findUniqueMock = vi.fn().mockResolvedValue({ vendorId: "v-1" });
      const prismaMock = {
        vendorConfig: {
          findUnique: findUniqueMock,
          update: updateMock,
        },
      } as any;

      const ok = await updateVendorPlatformBranding(prismaMock, "v-1", "Levelled Up by Merqify");
      expect(ok).toBe(true);
      expect(updateMock).toHaveBeenCalledWith({
        where: { vendorId: "v-1" },
        data: { platformBrandingTerminology: "Levelled Up by Merqify" },
      });
    });

    it("updateVendorPlatformBranding trims and stores null for empty string", async () => {
      const updateMock = vi.fn().mockResolvedValue({});
      const findUniqueMock = vi.fn().mockResolvedValue({ vendorId: "v-1" });
      const prismaMock = {
        vendorConfig: {
          findUnique: findUniqueMock,
          update: updateMock,
        },
      } as any;

      const ok = await updateVendorPlatformBranding(prismaMock, "v-1", "   ");
      expect(ok).toBe(true);
      expect(updateMock).toHaveBeenCalledWith({
        where: { vendorId: "v-1" },
        data: { platformBrandingTerminology: null },
      });
    });

    it("applyPlatformBrandingToAllVendors updates all vendor configs across the platform", async () => {
      const updateManyMock = vi.fn().mockResolvedValue({ count: 5 });
      const prismaMock = {
        vendorConfig: {
          updateMany: updateManyMock,
        },
      } as any;

      const count = await applyPlatformBrandingToAllVendors(prismaMock, "Custom Ecosystem Tag");
      expect(count).toBe(5);
      expect(updateManyMock).toHaveBeenCalledWith({
        data: { platformBrandingTerminology: "Custom Ecosystem Tag" },
      });
    });
  });

  describe("Stripe Checkout Integration", () => {
    function mockStripeOk() {
      const fetchMock = vi.fn(async () =>
        Response.json({ id: "cs_test_1", url: "https://checkout.stripe.com/pay/cs_test_1" }),
      );
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("uses DEFAULT_PLATFORM_BRANDING_TERMINOLOGY on Stripe Checkout line items by default", async () => {
      const fetchMock = mockStripeOk();
      await createStripePaymentService("sk_test_123").createPayment({
        orderNumber: "TEST-001",
        amountPence: 1500,
        currency: "GBP",
        vendorId: "v-1",
        vendorName: "Aheed Food Centre",
        returnOrigin: "https://test.local",
        confirmationToken: "token-123",
        expiresAt: new Date(Date.now() + 60000),
      });

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const body = new URLSearchParams(init.body as string);

      expect(body.get("line_items[0][price_data][product_data][description]")).toBe(
        "Levelled Up by Merqify",
      );
      expect(body.get("branding_settings[display_name]")).toBe("Aheed Food Centre");
    });

    it("reflects custom configured brandingTerminology on Stripe Checkout line items and metadata", async () => {
      const fetchMock = mockStripeOk();
      await createStripePaymentService("sk_test_123").createPayment({
        orderNumber: "TEST-002",
        amountPence: 2000,
        currency: "GBP",
        vendorId: "v-1",
        vendorName: "Aheed Food Centre",
        brandingTerminology: "Powered by NextGen Merqify",
        returnOrigin: "https://test.local",
        confirmationToken: "token-456",
        expiresAt: new Date(Date.now() + 60000),
      });

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const body = new URLSearchParams(init.body as string);

      expect(body.get("line_items[0][price_data][product_data][description]")).toBe(
        "Powered by NextGen Merqify",
      );
      expect(body.get("metadata[brandingTerminology]")).toBe("Powered by NextGen Merqify");
    });
  });

  describe("Transactional Email Layout", () => {
    it("renders custom platform branding terminology in HTML and plain text email footers", () => {
      const brand = {
        ...fallbackBrand("Test Store"),
        platformBrandingTerminology: "Levelled Up by Merqify",
      };

      const result = renderEmail(
        {
          preheader: "Preview",
          heading: "Order Update",
          reason: "Order status change",
        },
        brand,
      );

      expect(result.html).toContain(
        `<a href="${DEFAULT_PLATFORM_URL}" target="_blank" style="color:#6b7280;text-decoration:underline;">Levelled Up by Merqify</a>`,
      );
      expect(result.text).toContain(`Levelled Up by Merqify (${DEFAULT_PLATFORM_URL})`);
    });
  });
});
