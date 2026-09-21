import { describe, expect, it } from "vitest";
import {
  generateReferralCode,
  extractReferralPrefix,
  extractReferrerUserId,
  isSelfReferral,
  isUsersOwnReferralCode,
  buildReferralUrl,
  buildShareLinks,
} from "@/lib/referrals";

describe("referral rules and helpers", () => {
  it("generates deterministic referral codes for users", () => {
    const code1 = generateReferralCode("user-12345-abcde");
    const code2 = generateReferralCode("user-12345-abcde");
    expect(code1).toBe(code2);
    expect(code1.startsWith("REF-")).toBe(true);
    expect(code1.length).toBe(12); // "REF-" + 8 chars
  });

  it("extracts referral prefix", () => {
    expect(extractReferralPrefix("REF-ABC12345")).toBe("ABC12345");
    expect(extractReferralPrefix("ref-abc12345")).toBe("ABC12345");
    expect(extractReferralPrefix("INVALID")).toBeNull();
    expect(extractReferralPrefix("")).toBeNull();
  });

  it("extracts referrer user id from discount code description", () => {
    expect(extractReferrerUserId("Referral from user usr_abc123")).toBe("usr_abc123");
    expect(extractReferrerUserId("Referral from user   usr_999  ")).toBe("usr_999");
    expect(extractReferrerUserId("Different description")).toBeNull();
    expect(extractReferrerUserId("")).toBeNull();
    expect(extractReferrerUserId(null)).toBeNull();
  });

  it("detects self-referrals", () => {
    expect(isSelfReferral("user-1", "user-1")).toBe(true);
    expect(isSelfReferral("user-1", "user-2")).toBe(false);
    expect(isSelfReferral(null, "user-1")).toBe(false);
    expect(isSelfReferral("user-1", null)).toBe(false);
  });

  it("checks if code matches user's own referral code", () => {
    const userCode = generateReferralCode("user-alice-999");
    expect(isUsersOwnReferralCode(userCode, "user-alice-999")).toBe(true);
    expect(isUsersOwnReferralCode(userCode, "user-bob-888")).toBe(false);
    expect(isUsersOwnReferralCode("", "user-alice-999")).toBe(false);
  });

  it("builds clean referral URLs", () => {
    const url = buildReferralUrl("https://aheed.co.uk", "REF-A1B2C3D4");
    expect(url).toBe("https://aheed.co.uk/?ref=REF-A1B2C3D4");
  });

  it("builds valid social share links", () => {
    const share = buildShareLinks("https://aheed.co.uk/?ref=REF-1234", "Aheed Food Centre");
    expect(share.facebook).toContain("facebook.com/sharer");
    expect(share.twitter).toContain("twitter.com/intent/tweet");
    expect(share.email).toContain("mailto:");
    expect(share.whatsapp).toContain("wa.me");
  });
});
