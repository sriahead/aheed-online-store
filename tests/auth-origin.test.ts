import { describe, it, expect } from "vitest";
import { buildAuthOrigin } from "@/lib/auth-origin";

describe("buildAuthOrigin — same-vendor-only trust (no family config)", () => {
  it("trusts only its own origin when familyDomain is unset", () => {
    const o = buildAuthOrigin({ host: "aheedfoodcentre.nocaped.com", proto: "https" });
    expect(o.crossSubDomainCookies).toBeUndefined();
    expect(o.baseURL).toBe("https://aheedfoodcentre.nocaped.com");
    expect(o.trustedOrigins).toEqual(["https://aheedfoodcentre.nocaped.com"]);
  });

  it("does not trust another vendor's host", () => {
    const o = buildAuthOrigin({ host: "srimart.nocaped.com", proto: "https" });
    expect(o.trustedOrigins).toEqual(["https://srimart.nocaped.com"]);
    expect(o.trustedOrigins).not.toContain("https://aheedfoodcentre.nocaped.com");
  });

  it("derives baseURL + current origin from a non-https proto (local/preview)", () => {
    const o = buildAuthOrigin({ host: "localhost", proto: "http" });
    expect(o.baseURL).toBe("http://localhost");
    expect(o.trustedOrigins).toEqual(["http://localhost"]);
  });
});

describe("buildAuthOrigin — config-gated family mechanism", () => {
  const familyDomain = ".aheedfoodcentre.nocaped.com";

  it("enables the parent-domain cookie for a subdomain under the family", () => {
    const o = buildAuthOrigin({
      host: "shop.aheedfoodcentre.nocaped.com",
      proto: "https",
      familyDomain,
    });
    expect(o.crossSubDomainCookies).toEqual({ enabled: true, domain: familyDomain });
    expect(o.trustedOrigins).toContain("https://*.aheedfoodcentre.nocaped.com");
  });

  it("enables it for the family apex host itself", () => {
    const o = buildAuthOrigin({
      host: "aheedfoodcentre.nocaped.com",
      proto: "https",
      familyDomain,
    });
    expect(o.crossSubDomainCookies).toEqual({ enabled: true, domain: familyDomain });
  });

  it("keeps a custom-domain vendor isolated even when the family config is on", () => {
    const o = buildAuthOrigin({ host: "srimart.nocaped.com", proto: "https", familyDomain });
    expect(o.crossSubDomainCookies).toBeUndefined();
  });

  it("does not match a look-alike suffix substring (dot-boundary only)", () => {
    const o = buildAuthOrigin({
      host: "evilaheedfoodcentre.nocaped.com",
      proto: "https",
      familyDomain,
    });
    expect(o.crossSubDomainCookies).toBeUndefined();
  });

  it("treats an empty-string familyDomain as unset (host-only)", () => {
    const o = buildAuthOrigin({
      host: "shop.aheedfoodcentre.nocaped.com",
      proto: "https",
      familyDomain: "   ",
    });
    expect(o.crossSubDomainCookies).toBeUndefined();
  });
});
