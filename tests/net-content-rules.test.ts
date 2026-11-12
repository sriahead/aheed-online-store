import { describe, expect, it } from "vitest";
import { extractDetailedNetContent } from "@/lib/catalogue-import/net-content";
import { RULES_MODEL, suggestNetContentByRule } from "@/lib/net-content-rules";

/**
 * #697 — the live products had no net content, so no shopper saw a price per kg. The free rule step
 * reads what is certain; anything that names a weight without fixing it is left for a person.
 * The names below are real AFC lines (staging, 2026-11-12).
 */

const confidence = (text: string) => extractDetailedNetContent(text)?.confidence ?? null;

describe("extractDetailedNetContent: ambiguous text is never HIGH (#697)", () => {
  it.each([
    "Tilapia 500–800g",
    "Medium Chicken (1100–1200g)",
    "Fish 1.1-1.2kg",
    "Tilapia 800g+",
    "OVALTINE ORIGINAL 200G+50%",
    "Diamond 31/40 Headless Skin-On Prawns – 400g (Pack of 2)",
  ])("%s → LOW", (text) => {
    expect(confidence(text)).toBe("LOW");
  });

  it.each([
    ["Squid Block – 2kg", 2, "KILOGRAM"],
    ["Prawns 13/15 – 1kg", 1, "KILOGRAM"],
    ["Diamond 31/40 Prawns – 400g", 400, "GRAM"],
    ["Rice 4 x 5kg", 20, "KILOGRAM"],
    ["Golden Pomfret – Whole (Pack of 2)", 2, "EACH"],
    ["Flour 1.5kg", 1500, "GRAM"],
  ])("%s stays HIGH (%d %s)", (text, amount, unit) => {
    const found = extractDetailedNetContent(text);
    expect(found).toMatchObject({ amount, unit, confidence: "HIGH" });
  });
});

describe("suggestNetContentByRule", () => {
  it("reads a fixed size from the name and checks it against the label", () => {
    expect(
      suggestNetContentByRule({ name: "Squid Rings – 1kg", unitLabel: "£7.99", basePrice: 799 }),
    ).toMatchObject({ amount: 1, unit: "KILOGRAM", evidenceSource: "NAME", confidence: 90 });
  });

  it("reads a per-kg price that matches the base price as a 1 kg pack", () => {
    expect(
      suggestNetContentByRule({ name: "Barracuda", unitLabel: "£6.49 / kg", basePrice: 649 }),
    ).toEqual({
      amount: 1,
      unit: "KILOGRAM",
      confidence: 95,
      evidenceSource: "UNIT_LABEL",
      evidenceText: "£6.49 / kg",
      unitLabelCheck: "AGREES",
    });
  });

  it("refuses a per-kg label that disagrees with the price, a range, and a bare name", () => {
    expect(
      suggestNetContentByRule({ name: "Barracuda", unitLabel: "£6.49 / kg", basePrice: 1299 }),
    ).toBeNull();
    expect(
      suggestNetContentByRule({ name: "Tilapia 500–800g", unitLabel: "£10.99", basePrice: 1099 }),
    ).toBeNull();
    expect(
      suggestNetContentByRule({ name: "Watermelon", unitLabel: "£1.29", basePrice: 129 }),
    ).toBeNull();
  });

  it("names itself in the queue", () => {
    expect(RULES_MODEL).toBe("rules (no AI)");
  });
});
