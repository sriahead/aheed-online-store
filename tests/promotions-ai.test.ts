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
    expect(prompt).toContain("Premium Halal Lamb Chops");
    expect(prompt).toContain("£8.99");
    expect(prompt).toContain("£11.99");
    expect(prompt).toContain("£3.00");
    expect(prompt).toContain("Butchery");
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
