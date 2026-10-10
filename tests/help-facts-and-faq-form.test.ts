import { describe, expect, it } from "vitest";
import { freeDeliveryOffered, helpDeliveryFacts } from "@/lib/help-facts";
import {
  MAX_ANSWER_LENGTH,
  MAX_QUESTION_LENGTH,
  parseAnswer,
  parseFaqSortOrder,
  parseQuestion,
  parseVendorFaq,
} from "@/lib/faq-form";

/**
 * The two pure modules behind #1013 and #1012.
 *
 * `tests/help-vendor-facts.test.tsx` already covers what a shopper SEES, so this file deliberately
 * covers only what that one cannot reach from a rendered page: how a bare area prefix versus a
 * district prefix resolves through `resolveDeliveryRules`, and the form parsers, which have no
 * other coverage at all.
 */

const DEFAULTS = {
  deliveryFeePence: 349,
  minimumOrderPence: 1500,
  freeDeliveryThresholdPence: 3000,
};

describe("freeDeliveryOffered", () => {
  it("treats null and 0 alike as not offered", () => {
    // lib/delivery-pricing.ts's documented rule, and the one computeTotals and fulfilmentProgress
    // already follow. #892 is open against the store-admin guide claiming 0 means everything free.
    expect(freeDeliveryOffered(null)).toBe(false);
    expect(freeDeliveryOffered(0)).toBe(false);
    expect(freeDeliveryOffered(1)).toBe(true);
    expect(freeDeliveryOffered(3000)).toBe(true);
  });
});

describe("helpDeliveryFacts", () => {
  it("reports no variation when every area inherits the vendor defaults", () => {
    const facts = helpDeliveryFacts(DEFAULTS, [
      {
        prefix: "MK",
        deliveryFeePence: null,
        minimumOrderPence: null,
        freeDeliveryThresholdPence: null,
      },
    ]);

    expect(facts.varies).toEqual({ fee: false, minimum: false, threshold: false });
    expect(facts.areas).toEqual([
      {
        prefix: "MK",
        deliveryFeePence: 349,
        minimumOrderPence: 1500,
        freeDeliveryThresholdPence: 3000,
      },
    ]);
  });

  it("resolves a bare AREA prefix, which matchDeliveryArea rejects as written", () => {
    // "MK" alone matches nothing: that branch requires the outward code to be longer than the area
    // letters. The module appends a digit so the row's own overrides resolve. Without this, an
    // area-level override would silently render as the vendor default — the exact class of false
    // figure #1013 exists to remove.
    const facts = helpDeliveryFacts(DEFAULTS, [
      {
        prefix: "MK",
        deliveryFeePence: 499,
        minimumOrderPence: null,
        freeDeliveryThresholdPence: null,
      },
    ]);

    expect(facts.areas[0].deliveryFeePence).toBe(499);
    expect(facts.varies.fee).toBe(true);
  });

  it("resolves a DISTRICT prefix, and lets it beat the area row covering it", () => {
    const facts = helpDeliveryFacts(DEFAULTS, [
      {
        prefix: "MK",
        deliveryFeePence: 499,
        minimumOrderPence: null,
        freeDeliveryThresholdPence: null,
      },
      {
        prefix: "MK9",
        deliveryFeePence: 199,
        minimumOrderPence: 500,
        freeDeliveryThresholdPence: null,
      },
    ]);

    const mk9 = facts.areas.find((area) => area.prefix === "MK9");
    expect(mk9?.deliveryFeePence).toBe(199);
    expect(mk9?.minimumOrderPence).toBe(500);
    // Inherited from the vendor defaults, not from the MK row, because null means "use the default".
    expect(mk9?.freeDeliveryThresholdPence).toBe(3000);
    expect(facts.varies.minimum).toBe(true);
  });

  it("counts an override as variation even when it is the only area", () => {
    // One area overriding the store-wide fee still means the page must not print the default: it
    // would be wrong for the only place this vendor delivers to.
    const facts = helpDeliveryFacts(DEFAULTS, [
      {
        prefix: "RG1",
        deliveryFeePence: 99,
        minimumOrderPence: null,
        freeDeliveryThresholdPence: null,
      },
    ]);

    expect(facts.varies.fee).toBe(true);
  });

  it("prices collection from the vendor defaults, never per area", () => {
    const facts = helpDeliveryFacts(DEFAULTS, [
      {
        prefix: "MK9",
        deliveryFeePence: 199,
        minimumOrderPence: 500,
        freeDeliveryThresholdPence: null,
      },
    ]);

    expect(facts.collectionMinimumOrderPence).toBe(1500);
  });

  it("handles a vendor with no areas at all", () => {
    const facts = helpDeliveryFacts(DEFAULTS, []);

    expect(facts.areas).toEqual([]);
    expect(facts.varies).toEqual({ fee: false, minimum: false, threshold: false });
  });
});

describe("parseQuestion", () => {
  it("collapses internal whitespace rather than rejecting it", () => {
    const result = parseQuestion("  Do   you    deliver?  ");
    expect(result).toEqual({ ok: true, value: "Do you deliver?" });
  });

  it("refuses blank and over-length input", () => {
    expect(parseQuestion("   ").ok).toBe(false);
    expect(parseQuestion("x".repeat(MAX_QUESTION_LENGTH)).ok).toBe(true);
    expect(parseQuestion("x".repeat(MAX_QUESTION_LENGTH + 1)).ok).toBe(false);
  });
});

describe("parseAnswer", () => {
  it("keeps single line breaks but collapses longer runs", () => {
    const result = parseAnswer("One line.\n\n\n\nAnother line.");
    expect(result).toEqual({ ok: true, value: "One line.\n\nAnother line." });
  });

  it("normalises CRLF, which a Windows paste supplies", () => {
    const result = parseAnswer("First.\r\nSecond.");
    expect(result).toEqual({ ok: true, value: "First.\nSecond." });
  });

  it("refuses blank and over-length input", () => {
    expect(parseAnswer("\n\n  \n").ok).toBe(false);
    expect(parseAnswer("y".repeat(MAX_ANSWER_LENGTH)).ok).toBe(true);
    expect(parseAnswer("y".repeat(MAX_ANSWER_LENGTH + 1)).ok).toBe(false);
  });
});

describe("parseFaqSortOrder", () => {
  it("defaults a blank to 0 and refuses anything not a whole number at or above 0", () => {
    expect(parseFaqSortOrder("")).toEqual({ ok: true, value: 0 });
    expect(parseFaqSortOrder("3")).toEqual({ ok: true, value: 3 });
    expect(parseFaqSortOrder("-1").ok).toBe(false);
    expect(parseFaqSortOrder("1.5").ok).toBe(false);
    expect(parseFaqSortOrder("many").ok).toBe(false);
  });
});

describe("parseVendorFaq", () => {
  it("returns the whole value when every field is acceptable", () => {
    expect(
      parseVendorFaq({
        question: "Is there a minimum?",
        answer: "Yes — see the panel above.",
        sortOrder: "2",
        isActive: true,
      }),
    ).toEqual({
      ok: true,
      value: {
        question: "Is there a minimum?",
        answer: "Yes — see the panel above.",
        sortOrder: 2,
        isActive: true,
      },
    });
  });

  it("reports the first failing field, question before answer before order", () => {
    const blankQuestion = parseVendorFaq({
      question: "",
      answer: "",
      sortOrder: "nope",
      isActive: true,
    });
    expect(blankQuestion.ok).toBe(false);
    if (!blankQuestion.ok) expect(blankQuestion.error.field).toBe("question");

    const blankAnswer = parseVendorFaq({
      question: "Fine?",
      answer: "   ",
      sortOrder: "nope",
      isActive: true,
    });
    expect(blankAnswer.ok).toBe(false);
    if (!blankAnswer.ok) expect(blankAnswer.error.field).toBe("answer");
  });
});
