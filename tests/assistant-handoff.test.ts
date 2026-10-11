import { describe, expect, it } from "vitest";
import { buildHandoffText, buildHandoffUrl, HANDOFF_TEXT_MAX } from "@/lib/assistant-handoff";

/**
 * #1015 R18–R20 — the WhatsApp handoff text. Three inputs only (so no personal data can reach the
 * URL), a fixed shape, and a hard 300-character ceiling that never cuts the order number.
 */

describe("buildHandoffText (R18)", () => {
  it("has the fixed shape without an order number", () => {
    expect(buildHandoffText({ vendorName: "Test Store", subject: "Something else" })).toBe(
      "Hi Test Store, I have a question about: Something else.",
    );
  });

  it("appends the order-number sentence when one is given", () => {
    expect(
      buildHandoffText({
        vendorName: "Test Store",
        subject: "Swap an item in my order",
        orderNumber: "TST-20261011-ABC123",
      }),
    ).toBe(
      "Hi Test Store, I have a question about: Swap an item in my order. Order number: TST-20261011-ABC123.",
    );
  });
});

describe("the 300-character ceiling (R19)", () => {
  const longName = "N".repeat(1000);
  const longSubject = "S".repeat(1000);
  const ORDER = "TST-20261011-ABC123";

  it.each([
    ["no order number", undefined],
    ["an order number", ORDER],
  ])("never exceeds the cap with %s", (_label, orderNumber) => {
    const text = buildHandoffText({ vendorName: longName, subject: longSubject, orderNumber });
    expect(text.length).toBeLessThanOrEqual(HANDOFF_TEXT_MAX);
    expect(HANDOFF_TEXT_MAX).toBe(300);
  });

  it("cuts the vendor name to 60 first, then the subject with an ellipsis, keeping the order number whole", () => {
    const text = buildHandoffText({
      vendorName: longName,
      subject: longSubject,
      orderNumber: ORDER,
    });
    expect(text.startsWith(`Hi ${"N".repeat(60)}, `)).toBe(true);
    expect(text).not.toContain("N".repeat(61));
    expect(text).toContain("S….");
    expect(text.endsWith(` Order number: ${ORDER}.`)).toBe(true);
  });

  it("only cuts the name when the long name alone breaks the cap", () => {
    const text = buildHandoffText({ vendorName: longName, subject: "Discount codes" });
    expect(text).toBe(`Hi ${"N".repeat(60)}, I have a question about: Discount codes.`);
  });

  it("leaves an in-budget text untouched", () => {
    const name = "N".repeat(80);
    expect(buildHandoffText({ vendorName: name, subject: "Something else" })).toBe(
      `Hi ${name}, I have a question about: Something else.`,
    );
  });
});

describe("buildHandoffUrl (R20)", () => {
  it("builds a wa.me link with the text URI-encoded", () => {
    expect(buildHandoffUrl("447700900000", "a b&c")).toBe(
      "https://wa.me/447700900000?text=a%20b%26c",
    );
  });
});
