import { describe, expect, it } from "vitest";
import {
  buildPromotionPrompt,
  parsePromotionAiResponse,
  type PromotionAiInput,
} from "@/lib/promotions-ai";

describe("Promotions AI prompt and parser (R14)", () => {
  it("builds a prompt containing all 4 consumer psychology disciplines and pricing anchors", () => {
    const input: PromotionAiInput = {
      vendorId: "v-123",
      storeName: "Aheed Super Store",
      storeDescription: "Authentic Asian & Middle Eastern Grocer",
      targetType: "PRODUCT",
      itemDetails: {
        name: "Premium Halal Lamb Chops",
        description: "Fresh tender cuts prepared daily",
        basePricePence: 899,
        originalPricePence: 1199,
        savingsPence: 300,
        multiBuyQuantity: 2,
        multiBuyPricePence: 1600,
      },
      categoryName: "Butchery",
      audienceSegment: "ALL",
      channel: "WEBSITE",
    };

    const prompt = buildPromotionPrompt(input);

    expect(prompt).toContain("BEHAVIOURAL ECONOMICS");
    expect(prompt).toContain("COGNITIVE BIASES");
    expect(prompt).toContain("PRICING PSYCHOLOGY");
    expect(prompt).toContain("NEUROMARKETING");
    expect(prompt).toContain("CRITICAL TRUTHFULNESS & ANTI-HALLUCINATION RULES");
    expect(prompt).toContain("NEVER fabricate, invent, or assume any discount percentage");
    expect(prompt).toContain("Premium Halal Lamb Chops");
    expect(prompt).toContain("£8.99");
    expect(prompt).toContain("£11.99");
    expect(prompt).toContain("£3.00");
    expect(prompt).toContain("Butchery");
  });

  it("instructs model not to claim discounts when no savings exist", () => {
    const input: PromotionAiInput = {
      vendorId: "v-123",
      targetType: "PRODUCT",
      itemDetails: {
        name: "Whole Cardamom Pods 100g",
        basePricePence: 399,
        originalPricePence: null,
        savingsPence: null,
      },
      audienceSegment: "ALL",
      channel: "WEBSITE",
    };

    const prompt = buildPromotionPrompt(input);

    expect(prompt).toContain("CRITICAL TRUTHFULNESS & ANTI-HALLUCINATION RULES");
    expect(prompt).toContain("If NO discount, savings, or multi-buy offer is explicitly listed");
    expect(prompt).not.toContain("Regular/Was Price");
    expect(prompt).not.toContain("Markdown Savings");
    expect(prompt).not.toContain("Multi-buy Offer");
  });

  it("formats bundle contents and total price for truthful AI promotion", () => {
    const input: PromotionAiInput = {
      vendorId: "v-123",
      targetType: "BUNDLE",
      itemDetails: {
        name: "Weekly Curry Spice Kit",
        description: "Everything you need for authentic curries",
        basePricePence: 1250,
        bundleItems: [
          { name: "Coriander Seeds 100g", quantity: 2, pricePence: 250 },
          { name: "Cumin Seeds 100g", quantity: 3, pricePence: 250 },
        ],
      },
      audienceSegment: "ALL",
      channel: "WEBSITE",
    };

    const prompt = buildPromotionPrompt(input);

    expect(prompt).toContain("Bundle Contents:");
    expect(prompt).toContain("2x Coriander Seeds 100g (£2.50 each)");
    expect(prompt).toContain("3x Cumin Seeds 100g (£2.50 each)");
    expect(prompt).toContain("Current Selling Price: £12.50");
  });

  it("includes multi-buy savings when multi-buy is active", () => {
    const input: PromotionAiInput = {
      vendorId: "v-123",
      targetType: "PRODUCT",
      itemDetails: {
        name: "Fresh Coconut",
        basePricePence: 399,
        multiBuyQuantity: 3,
        multiBuyPricePence: 1000,
        multiBuySavingsPence: 197,
      },
      audienceSegment: "ALL",
      channel: "WEBSITE",
    };

    const prompt = buildPromotionPrompt(input);

    expect(prompt).toContain(
      "Multi-buy Offer: 3 for £10.00 (Save £1.97 compared to single unit price)",
    );
  });

  it("converts basis points to percentage correctly in discount offer prompt (500 bps = 5%)", () => {
    const input: PromotionAiInput = {
      vendorId: "v-123",
      targetType: "DISCOUNT_CODE",
      itemDetails: {
        name: "Discount Code WEEKENDMEAT5",
        discountKind: "PERCENTAGE",
        discountValue: 500, // 500 basis points = 5%
      },
      audienceSegment: "ALL",
      channel: "WEBSITE",
    };

    const prompt = buildPromotionPrompt(input);

    expect(prompt).toContain("Discount Offer: 5% OFF");
    expect(prompt).not.toContain("500% OFF");
  });

  it("formats fixed amount discount offer correctly (500 pence = £5.00)", () => {
    const input: PromotionAiInput = {
      vendorId: "v-123",
      targetType: "DISCOUNT_CODE",
      itemDetails: {
        name: "Discount Code SAVE5",
        discountKind: "FIXED_AMOUNT",
        discountValue: 500, // 500 pence = £5.00
      },
      audienceSegment: "ALL",
      channel: "WEBSITE",
    };

    const prompt = buildPromotionPrompt(input);

    expect(prompt).toContain("Discount Offer: £5.00 OFF");
  });

  it("parses valid JSON response", () => {
    const raw = JSON.stringify({
      headline: "Weekend Butchery Feast",
      subtitle: "Save £3.00 on fresh prime halal lamb chops this Friday through Sunday",
      badgeText: "Customer Favourite",
      callToActionText: "Claim Deal",
      altText: "Platter of fresh halal lamb chops garnished with rosemary on dark slate",
      imagePrompt: "Commercial photography of fresh lamb chops, dramatic lighting, high contrast",
    });

    const parsed = parsePromotionAiResponse(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.headline).toBe("Weekend Butchery Feast");
    expect(parsed?.badgeText).toBe("Customer Favourite");
    expect(parsed?.callToActionText).toBe("Claim Deal");
  });

  it("extracts JSON wrapped in conversational prose from model output", () => {
    const raw = `
Here is your marketing promotional campaign copy:
{
  "headline": "3 for £10 Essentials",
  "subtitle": "Stock up on pantry favourites and save more",
  "badgeText": "Limited Offer",
  "callToActionText": "Shop Now",
  "altText": "Pantry cans stacked neatly on wooden shelf",
  "imagePrompt": "Vibrant pantry items on wooden table"
}
Hope this helps boost conversions!
    `;

    const parsed = parsePromotionAiResponse(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.headline).toBe("3 for £10 Essentials");
    expect(parsed?.badgeText).toBe("Limited Offer");
  });

  it("returns null for malformed or missing JSON", () => {
    expect(parsePromotionAiResponse("Sorry, I could not generate that.")).toBeNull();
  });
});
