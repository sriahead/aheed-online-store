import { describe, expect, it } from "vitest";
import { parsePromotionForm } from "@/lib/promotion-form";

const TIMEZONE = "Europe/London";

describe("parsePromotionForm (R6, R22)", () => {
  it("parses a valid generic store-wide promotion", () => {
    const raw = {
      headline: "Weekend Special",
      subtitle: "Save on fresh produce",
      badgeText: "Weekend Deal",
      callToActionText: "Explore Offers",
      targetType: "GENERIC",
      priority: "10",
      isActive: "true",
      linkUrl: "/categories",
    };

    const result = parsePromotionForm(raw, TIMEZONE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.headline).toBe("Weekend Special");
    expect(result.value.subtitle).toBe("Save on fresh produce");
    expect(result.value.badgeText).toBe("Weekend Deal");
    expect(result.value.callToActionText).toBe("Explore Offers");
    expect(result.value.priority).toBe(10);
    expect(result.value.isActive).toBe(true);
    expect(result.value.categoryId).toBeNull();
    expect(result.value.bundleId).toBeNull();
    expect(result.value.discountCodeId).toBeNull();
  });

  it("rejects headline shorter than 3 characters", () => {
    const raw = { headline: "Hi", targetType: "GENERIC" };
    const result = parsePromotionForm(raw, TIMEZONE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("headline");
  });

  it("rejects headline longer than 100 characters", () => {
    const raw = { headline: "a".repeat(101), targetType: "GENERIC" };
    const result = parsePromotionForm(raw, TIMEZONE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("headline");
  });

  it("rejects non-relative link URLs", () => {
    const raw = {
      headline: "Valid Headline",
      linkUrl: "https://external.example.com",
    };
    const result = parsePromotionForm(raw, TIMEZONE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("linkUrl");
  });

  it("requires categoryId when targetType is DEPARTMENT", () => {
    const raw = {
      headline: "Department Promo",
      targetType: "DEPARTMENT",
    };
    const result = parsePromotionForm(raw, TIMEZONE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("categoryId");
  });

  it("accepts categoryId when targetType is DEPARTMENT", () => {
    const raw = {
      headline: "Department Promo",
      targetType: "DEPARTMENT",
      categoryId: "cat-123",
    };
    const result = parsePromotionForm(raw, TIMEZONE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.categoryId).toBe("cat-123");
  });

  it("requires bundleId when targetType is BUNDLE", () => {
    const raw = {
      headline: "Bundle Promo",
      targetType: "BUNDLE",
    };
    const result = parsePromotionForm(raw, TIMEZONE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("bundleId");
  });

  it("requires discountCodeId when targetType is DISCOUNT_CODE", () => {
    const raw = {
      headline: "Discount Promo",
      targetType: "DISCOUNT_CODE",
    };
    const result = parsePromotionForm(raw, TIMEZONE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("discountCodeId");
  });

  it("requires productId when targetType is PRODUCT", () => {
    const raw = {
      headline: "Product Promo",
      targetType: "PRODUCT",
    };
    const result = parsePromotionForm(raw, TIMEZONE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("productId");
  });

  it("accepts productId and channel when targetType is PRODUCT", () => {
    const raw = {
      headline: "Product Promo",
      targetType: "PRODUCT",
      productId: "prod-123",
      channel: "WHATSAPP",
    };
    const result = parsePromotionForm(raw, TIMEZONE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.productId).toBe("prod-123");
    expect(result.value.channel).toBe("WHATSAPP");
  });

  it("rejects end date before start date", () => {
    const raw = {
      headline: "Dated Promo",
      startsAt: "2026-11-10T12:00",
      endsAt: "2026-11-05T12:00",
    };
    const result = parsePromotionForm(raw, TIMEZONE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("endsAt");
  });
});
