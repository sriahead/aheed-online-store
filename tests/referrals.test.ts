import { describe, expect, it } from "vitest";
import {
  generateRandomReferralCode,
  extractReferralPrefix,
  isSelfReferral,
  referralBonusRecipient,
  REFERRAL_CODE_ALPHABET,
  buildReferralUrl,
  buildShareLinks,
} from "@/lib/referrals";

describe("referral rules and helpers", () => {
  // #987 R7 — random, not derived from the user id, and from an alphabet with no 0/1/O/I.
  it("generates random REF- codes from the unambiguous 32-character alphabet", () => {
    const code = generateRandomReferralCode();
    expect(code).toMatch(/^REF-[A-HJ-NP-Z2-9]{8}$/);
    expect(extractReferralPrefix(code)).toBe(code.slice(4));
    expect(REFERRAL_CODE_ALPHABET).toHaveLength(32);
    expect(REFERRAL_CODE_ALPHABET).not.toMatch(/[01OI]/);
  });

  it("maps each random byte to one alphabet character (byte & 31)", () => {
    const bytes = [0, 1, 31, 32, 255, 8, 16, 24];
    const code = generateRandomReferralCode((buffer) => {
      buffer.set(bytes);
      return buffer;
    });
    expect(code).toBe(`REF-${bytes.map((b) => REFERRAL_CODE_ALPHABET[b & 31]).join("")}`);
  });

  it("asks the random source for exactly 8 bytes", () => {
    const sizes: number[] = [];
    generateRandomReferralCode((buffer) => {
      sizes.push(buffer.length);
      return buffer;
    });
    expect(sizes).toEqual([8]);
  });

  it("extracts referral prefix", () => {
    expect(extractReferralPrefix("REF-ABC12345")).toBe("ABC12345");
    expect(extractReferralPrefix("ref-abc12345")).toBe("ABC12345");
    expect(extractReferralPrefix("INVALID")).toBeNull();
    expect(extractReferralPrefix("")).toBeNull();
  });

  it("detects self-referrals", () => {
    expect(isSelfReferral("user-1", "user-1")).toBe(true);
    expect(isSelfReferral("user-1", "user-2")).toBe(false);
    expect(isSelfReferral(null, "user-1")).toBe(false);
    expect(isSelfReferral("user-1", null)).toBe(false);
  });

  // #987 R14 — who earns the referral bonus, decided from the code's referrerUserId FK.
  it("credits the code's owner, never the ordering shopper, and nobody for an ownerless code", () => {
    expect(referralBonusRecipient("owner-1", "buyer-2")).toBe("owner-1");
    expect(referralBonusRecipient(null, "buyer-2")).toBeNull();
    expect(referralBonusRecipient(undefined, "buyer-2")).toBeNull();
    expect(referralBonusRecipient("owner-1", "owner-1")).toBeNull();
  });

  it("builds clean referral URLs", () => {
    const url = buildReferralUrl("https://aheed.co.uk", "REF-A1B2C3D4");
    expect(url).toBe("https://aheed.co.uk/?ref=REF-A1B2C3D4");
  });

  it("builds valid social share links", () => {
    const share = buildShareLinks("https://aheed.co.uk/?ref=REF-1234", "Aheed Food Centre", 500);
    expect(share.facebook).toContain("facebook.com/sharer");
    expect(share.twitter).toContain("twitter.com/intent/tweet");
    expect(share.email).toContain("mailto:");
    expect(share.whatsapp).toContain("wa.me");
  });

  // #729 R5 — every share message names the vendor passed in and assumes no product category.
  it("names the given store and never says grocery, for a non-grocery vendor", () => {
    const share = buildShareLinks("https://srimart.example/?ref=REF-1234", "SriMart", 500);
    for (const link of Object.values(share)) {
      const decoded = decodeURIComponent(link);
      expect(decoded).not.toMatch(/grocer/i);
    }
    // facebook's sharer carries only the URL, so the name is asserted on the three with text.
    for (const link of [share.twitter, share.email, share.whatsapp]) {
      expect(decodeURIComponent(link)).toContain("SriMart");
    }
  });

  // #907 R23 — every share message quotes the discount it is given, never a fixed "£5".
  it("formats the given discount in the X, WhatsApp and email messages", () => {
    const share = buildShareLinks("https://srimart.example/?ref=REF-1234", "SriMart", 750);
    for (const link of [share.twitter, share.email, share.whatsapp]) {
      const decoded = decodeURIComponent(link);
      expect(decoded).toContain("£7.50");
      expect(decoded).not.toContain("£5");
    }
  });
});
