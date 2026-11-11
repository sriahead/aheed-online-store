import { describe, it, expect } from "vitest";
import { emailDomain, parseVar, stripeMode } from "@/scripts/aheed-data-inventory";

describe("#1504 aheed-data-inventory helpers", () => {
  it("reads a key in both the plain and the spaced secrets-file form, and nothing else", () => {
    const text =
      "A_URL=\"postgres://h/db\"\nB_URL = 'postgres://g/db'\r\nA_URL_EXTRA=x\n# A_URL=commented";
    expect(parseVar(text, "A_URL")).toBe("postgres://h/db");
    expect(parseVar(text, "B_URL")).toBe("postgres://g/db");
    expect(parseVar(text, "MISSING")).toBeUndefined();
  });

  it("reports a sender address by domain only", () => {
    expect(emailDomain("orders@AheedFoodCentre.co.uk")).toBe("aheedfoodcentre.co.uk");
    expect(emailDomain("")).toBe("(none)");
    expect(emailDomain(null)).toBe("(none)");
  });

  it("classifies a Stripe reference by its mode prefix", () => {
    expect(stripeMode("cs_test_a1b2")).toBe("test");
    expect(stripeMode("cs_live_a1b2")).toBe("live");
    expect(stripeMode("pi_3Nabc")).toBe("other");
    expect(stripeMode(null)).toBe("none");
  });
});
