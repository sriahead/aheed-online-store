import { describe, expect, it } from "vitest";
import { parseCampaignForm } from "@/lib/campaign-form";
import type { RawForm } from "@/lib/catalogue-form";

/**
 * P8.5e (#356) — the campaign form's field rules, unit-tested with no
 * database. Same posture as tests/catalogue-form.test.ts: what a submitted
 * field MEANS is decided here, where a test can reach it without a session or
 * a request.
 */

function campaignForm(overrides: RawForm = {}): RawForm {
  return {
    headline: "Fresh HMC Halal Butchery",
    subtitle: "English lamb, cut to order",
    linkUrl: "/categories/halal-meat",
    isActive: "on",
    startsAt: "",
    endsAt: "",
    ...overrides,
  };
}

describe("parseCampaignForm", () => {
  it("accepts a complete, valid form", () => {
    const result = parseCampaignForm(campaignForm());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.headline).toBe("Fresh HMC Halal Butchery");
      expect(result.value.subtitle).toBe("English lamb, cut to order");
      expect(result.value.linkUrl).toBe("/categories/halal-meat");
      expect(result.value.isActive).toBe(true);
      expect(result.value.startsAt).toBeNull();
      expect(result.value.endsAt).toBeNull();
    }
  });

  it("requires a headline", () => {
    const result = parseCampaignForm(campaignForm({ headline: "" }));
    expect(result).toEqual({
      ok: false,
      error: { field: "headline", message: "Headline is required." },
    });
  });

  it("treats a blank subtitle as null, not empty string", () => {
    const result = parseCampaignForm(campaignForm({ subtitle: "" }));
    expect(result.ok && result.value.subtitle).toBeNull();
  });

  it("treats a blank link as null (falls back to the department's own page)", () => {
    const result = parseCampaignForm(campaignForm({ linkUrl: "" }));
    expect(result.ok && result.value.linkUrl).toBeNull();
  });

  it("refuses an absolute URL as the link", () => {
    const result = parseCampaignForm(campaignForm({ linkUrl: "https://evil.example/phish" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.field).toBe("linkUrl");
  });

  it("refuses a protocol-relative URL as the link", () => {
    const result = parseCampaignForm(campaignForm({ linkUrl: "//evil.example/phish" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.field).toBe("linkUrl");
  });

  it("accepts a relative link with a query string", () => {
    const result = parseCampaignForm(
      campaignForm({ linkUrl: "/categories/halal-meat?isOffer=true" }),
    );
    expect(result.ok && result.value.linkUrl).toBe("/categories/halal-meat?isOffer=true");
  });

  it("reads an unchecked isActive checkbox as false", () => {
    const result = parseCampaignForm(campaignForm({ isActive: undefined }));
    expect(result.ok && result.value.isActive).toBe(false);
  });

  it("parses a valid start and end date", () => {
    const result = parseCampaignForm(
      campaignForm({ startsAt: "2026-09-01T09:00", endsAt: "2026-09-30T17:00" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.startsAt).toBeInstanceOf(Date);
      expect(result.value.endsAt).toBeInstanceOf(Date);
    }
  });

  /*
   * P8.5f (R20). The test above asserts only `toBeInstanceOf(Date)` — which is
   * exactly why the timezone defect shipped: a Date built from the WRONG instant
   * is still a Date. These two pin the actual instant, in UTC, so a regression to
   * `new Date(value)` fails here instead of on a staff member's screen.
   *
   * `07:25` typed on a BST date means `06:25Z`, not `07:25Z`.
   */
  it("reads a summer (BST) start time as the instant the admin meant", () => {
    const result = parseCampaignForm(campaignForm({ startsAt: "2026-08-25T07:25" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.startsAt?.toISOString()).toBe("2026-08-25T06:25:00.000Z");
    }
  });

  it("reads a winter (GMT) start time with no offset applied", () => {
    const result = parseCampaignForm(campaignForm({ startsAt: "2026-01-15T07:25" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.startsAt?.toISOString()).toBe("2026-01-15T07:25:00.000Z");
    }
  });

  it("refuses an end date before the start date", () => {
    const result = parseCampaignForm(
      campaignForm({ startsAt: "2026-09-30T09:00", endsAt: "2026-09-01T17:00" }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.field).toBe("endsAt");
  });

  it("refuses an unparsable date", () => {
    const result = parseCampaignForm(campaignForm({ startsAt: "not-a-date" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.field).toBe("startsAt");
  });
});
