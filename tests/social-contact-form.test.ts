import { describe, it, expect } from "vitest";
import {
  FACEBOOK_URL_FIELD,
  INSTAGRAM_URL_FIELD,
  WHATSAPP_NUMBER_FIELD,
  parseSocialContact,
  parseSocialUrl,
  parseWhatsappNumber,
} from "@/lib/social-contact-form";

/**
 * P9.2 (#407, #405). These three values land inside an `href` on every storefront page, which is
 * what makes the scheme check a security control rather than a tidiness one: `new URL()` parses
 * `javascript:alert(1)` perfectly happily, so "it parsed" proves nothing about whether it is safe
 * to render. The allow-list is asserted by name below, not merely by rejecting one bad example.
 */

describe("parseSocialUrl", () => {
  it("accepts an https URL and returns it unchanged", () => {
    const result = parseSocialUrl(
      "https://www.facebook.com/aheedfoodcentre",
      FACEBOOK_URL_FIELD,
      "Facebook",
    );
    expect(result).toEqual({ ok: true, value: "https://www.facebook.com/aheedfoodcentre" });
  });

  it("trims surrounding whitespace before storing", () => {
    const result = parseSocialUrl("  https://instagram.com/x  ", INSTAGRAM_URL_FIELD, "Instagram");
    expect(result).toEqual({ ok: true, value: "https://instagram.com/x" });
  });

  it.each([
    ["javascript:alert(1)", "javascript"],
    ["data:text/html,<script>alert(1)</script>", "data"],
    ["file:///etc/passwd", "file"],
    ["http://www.facebook.com/aheed", "http"],
    ["ftp://example.com/x", "ftp"],
  ])("rejects %s (%s scheme)", (input) => {
    const result = parseSocialUrl(input, FACEBOOK_URL_FIELD, "Facebook");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe(FACEBOOK_URL_FIELD);
  });

  it("rejects a value that is not a URL at all", () => {
    const result = parseSocialUrl("facebook.com/aheed", FACEBOOK_URL_FIELD, "Facebook");
    expect(result.ok).toBe(false);
  });

  it("rejects an https URL with no host", () => {
    const result = parseSocialUrl("https://", FACEBOOK_URL_FIELD, "Facebook");
    expect(result.ok).toBe(false);
  });

  it.each(["", "   "])("parses a blank value (%j) to null rather than an error", (input) => {
    // Blank is a real choice: null HIDES the link (#239), so clearing a field is
    // deliberate and must not be reported as a typo.
    expect(parseSocialUrl(input, FACEBOOK_URL_FIELD, "Facebook")).toEqual({
      ok: true,
      value: null,
    });
  });

  it("names the field it was given, so the form can outline the right input", () => {
    const result = parseSocialUrl("http://x.com", INSTAGRAM_URL_FIELD, "Instagram");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe(INSTAGRAM_URL_FIELD);
  });
});

describe("parseWhatsappNumber", () => {
  it("accepts a digits-only international number", () => {
    expect(parseWhatsappNumber("447700900123", WHATSAPP_NUMBER_FIELD)).toEqual({
      ok: true,
      value: "447700900123",
    });
  });

  it.each(["+447700900123", "44 7700 900123", "44-7700-900123", "(44)7700900123", "44770090012a"])(
    "rejects %s — wa.me takes digits only",
    (input) => {
      const result = parseWhatsappNumber(input, WHATSAPP_NUMBER_FIELD);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.field).toBe(WHATSAPP_NUMBER_FIELD);
    },
  );

  it.each(["123456", "1234567890123456"])("rejects out-of-range length %s", (input) => {
    expect(parseWhatsappNumber(input, WHATSAPP_NUMBER_FIELD).ok).toBe(false);
  });

  // The bug this rule exists for. `07448894146` is digits-only and in range, so the original
  // `^\d{7,15}$` accepted it — and wa.me then opened WhatsApp with no chat and no error. An
  // E.164 number never starts with 0.
  it.each(["07448894146", "07700900123", "0123456789"])(
    "rejects national-format %s (leading zero)",
    (input) => {
      const result = parseWhatsappNumber(input, WHATSAPP_NUMBER_FIELD);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.field).toBe(WHATSAPP_NUMBER_FIELD);
        expect(result.error.message).toMatch(/leading 0|country code/i);
      }
    },
  );

  it("accepts the international form of the number it rejects nationally", () => {
    expect(parseWhatsappNumber("447448894146", WHATSAPP_NUMBER_FIELD)).toEqual({
      ok: true,
      value: "447448894146",
    });
  });

  it("parses a blank value to null", () => {
    expect(parseWhatsappNumber("   ", WHATSAPP_NUMBER_FIELD)).toEqual({ ok: true, value: null });
  });
});

describe("parseSocialContact", () => {
  it("returns all three values when every field is valid", () => {
    const result = parseSocialContact({
      facebookUrl: "https://facebook.com/a",
      instagramUrl: "https://instagram.com/b",
      whatsappNumber: "447700900123",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        facebookUrl: "https://facebook.com/a",
        instagramUrl: "https://instagram.com/b",
        whatsappNumber: "447700900123",
      },
    });
  });

  it("returns all three as null when every field is blank", () => {
    const result = parseSocialContact({ facebookUrl: "", instagramUrl: "", whatsappNumber: "" });
    expect(result).toEqual({
      ok: true,
      value: { facebookUrl: null, instagramUrl: null, whatsappNumber: null },
    });
  });

  it("reports the first failing field and does not continue past it", () => {
    const result = parseSocialContact({
      facebookUrl: "javascript:alert(1)",
      instagramUrl: "also-invalid",
      whatsappNumber: "+44",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe(FACEBOOK_URL_FIELD);
  });

  it("rejects the whole submission when only the number is wrong", () => {
    const result = parseSocialContact({
      facebookUrl: "https://facebook.com/a",
      instagramUrl: "",
      whatsappNumber: "+447700900123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe(WHATSAPP_NUMBER_FIELD);
  });
});
