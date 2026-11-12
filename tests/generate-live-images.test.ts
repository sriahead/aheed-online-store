import { describe, it, expect } from "vitest";
import {
  bundlePrompt,
  productPromptName,
  promotionPrompt,
  safeForImageModel,
  subjectFromHeadline,
} from "@/scripts/generate-live-images";

describe("#1521 image prompts", () => {
  it("drops sizes and pack notes from a product name", () => {
    expect(productPromptName("Medium Chicken (1100–1200g)")).toBe("Medium Chicken");
    expect(productPromptName("Catfish – Box")).toBe("Catfish");
  });

  it("rewords butchery terms the model refuses, in the prompt only", () => {
    expect(safeForImageModel("Chicken Breast")).toContain("poultry fillets");
    expect(safeForImageModel("Chicken Thigh Boneless")).toContain("boneless poultry pieces");
    expect(safeForImageModel("Tilapia")).toBe("Tilapia");
  });

  it("never puts marketing words, headlines or prices into a bundle or banner prompt", () => {
    const prompts = [
      bundlePrompt(["Medium Chicken", "Baby Chicken"]),
      promotionPrompt(["Medium Chicken"]),
      promotionPrompt([subjectFromHeadline("Turkey Box Offers")]),
    ];
    for (const p of prompts) {
      expect(p).not.toMatch(/advert|promotion|banner|offer|£|multi-buy|deal/i);
    }
  });

  it("turns a box-offer headline into the food it pictures", () => {
    expect(subjectFromHeadline("Turkey Box Offers")).toBe("frozen turkey in cardboard boxes");
    expect(subjectFromHeadline("Whole Chicken Multi-Buy")).toBe("whole chicken");
  });
});
