import { describe, expect, it } from "vitest";
import {
  decideSignUpMarketingConsent,
  marketingConsentStatement,
  MARKETING_OPT_IN_FIELD,
  SIGN_UP_EMAIL_PATH,
} from "@/lib/marketing-consent";

/** #1134 — the pure marketing-consent rules: the exact statement and the sign-up decision. */

const ON = { id: "vendor-a", name: "Test Store", marketingConsentEnabled: true };

describe("marketingConsentStatement", () => {
  it("is the exact email-only sentence, built from the vendor's own name", () => {
    expect(marketingConsentStatement("Test Store")).toBe(
      "Email me marketing and promotional offers from Test Store. You can change this at any time in your account.",
    );
  });
});

describe("decideSignUpMarketingConsent", () => {
  const optedIn = { [MARKETING_OPT_IN_FIELD]: true };

  it("records for an email sign-up that ticked the box, at a store whose switch is on", () => {
    expect(
      decideSignUpMarketingConsent({ path: SIGN_UP_EMAIL_PATH, body: optedIn, vendor: ON }),
    ).toEqual({
      record: true,
      vendorId: "vendor-a",
      statement: marketingConsentStatement("Test Store"),
    });
  });

  it("skips any path other than the email sign-up (a Google sign-up has no checkbox)", () => {
    expect(
      decideSignUpMarketingConsent({ path: "/callback/google", body: optedIn, vendor: ON }),
    ).toEqual({ record: false, reason: "not-email-sign-up" });
    expect(decideSignUpMarketingConsent({ path: undefined, body: optedIn, vendor: ON })).toEqual({
      record: false,
      reason: "not-email-sign-up",
    });
  });

  it("skips a sign-up without the flag, or with anything but the boolean true", () => {
    for (const body of [
      {},
      { [MARKETING_OPT_IN_FIELD]: "true" },
      { [MARKETING_OPT_IN_FIELD]: false },
      null,
      "x",
    ]) {
      expect(decideSignUpMarketingConsent({ path: SIGN_UP_EMAIL_PATH, body, vendor: ON })).toEqual({
        record: false,
        reason: "not-opted-in",
      });
    }
  });

  it("skips when no vendor resolves from the request", () => {
    expect(
      decideSignUpMarketingConsent({ path: SIGN_UP_EMAIL_PATH, body: optedIn, vendor: null }),
    ).toEqual({ record: false, reason: "no-vendor" });
  });

  it("skips when the store's switch is off, even if a crafted request carries the flag", () => {
    expect(
      decideSignUpMarketingConsent({
        path: SIGN_UP_EMAIL_PATH,
        body: optedIn,
        vendor: { ...ON, marketingConsentEnabled: false },
      }),
    ).toEqual({ record: false, reason: "switch-off" });
  });

  it("ignores any statement text in the body and builds it from the vendor name", () => {
    const decision = decideSignUpMarketingConsent({
      path: SIGN_UP_EMAIL_PATH,
      body: { ...optedIn, statement: "Something else entirely" },
      vendor: ON,
    });
    expect(decision.record && decision.statement).toBe(marketingConsentStatement("Test Store"));
  });
});
