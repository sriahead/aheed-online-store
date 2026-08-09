import { describe, it, expect, vi } from "vitest";

// buildAuthOrigin is pure and doesn't touch these, but lib/auth-origin.ts
// imports getPrisma from lib/db.ts at module scope, which imports
// @prisma/client/wasm — unresolvable under vitest/Node (same reason
// tests/tenant.test.ts mocks lib/db; see CLAUDE.md). Mock so the module loads.
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/config", () => ({ getEnv: vi.fn() }));

const { buildAuthOrigin } = await import("@/lib/auth-origin");

const VENDOR_HOSTS = ["aheedfoodcentre.nocaped.com", "srimart.nocaped.com"];

describe("buildAuthOrigin — isolated-by-default (no family config)", () => {
  it("keeps a family-shaped host host-only when familyDomain is unset", () => {
    const o = buildAuthOrigin({
      host: "aheedfoodcentre.nocaped.com",
      proto: "https",
      vendorHosts: VENDOR_HOSTS,
    });
    expect(o.crossSubDomainCookies).toBeUndefined();
    expect(o.baseURL).toBe("https://aheedfoodcentre.nocaped.com");
  });

  it("keeps a custom-domain host host-only when familyDomain is unset", () => {
    const o = buildAuthOrigin({
      host: "srimart.nocaped.com",
      proto: "https",
      vendorHosts: VENDOR_HOSTS,
    });
    expect(o.crossSubDomainCookies).toBeUndefined();
  });

  it("trusts the current origin + every vendor host, de-duplicated", () => {
    const o = buildAuthOrigin({
      host: "aheedfoodcentre.nocaped.com",
      proto: "https",
      vendorHosts: [...VENDOR_HOSTS, "aheedfoodcentre.nocaped.com"], // dup on purpose
    });
    expect(o.trustedOrigins).toEqual([
      "https://aheedfoodcentre.nocaped.com",
      "https://srimart.nocaped.com",
    ]);
  });

  it("derives baseURL + current origin from a non-https proto (local/preview)", () => {
    const o = buildAuthOrigin({
      host: "localhost",
      proto: "http",
      vendorHosts: [],
    });
    expect(o.baseURL).toBe("http://localhost");
    expect(o.trustedOrigins).toContain("http://localhost");
  });
});

describe("buildAuthOrigin — config-gated family mechanism", () => {
  const familyDomain = ".aheedfoodcentre.nocaped.com";

  it("enables the parent-domain cookie for a subdomain under the family", () => {
    const o = buildAuthOrigin({
      host: "shop.aheedfoodcentre.nocaped.com",
      proto: "https",
      vendorHosts: VENDOR_HOSTS,
      familyDomain,
    });
    expect(o.crossSubDomainCookies).toEqual({ enabled: true, domain: familyDomain });
    expect(o.trustedOrigins).toContain("https://*.aheedfoodcentre.nocaped.com");
  });

  it("enables it for the family apex host itself", () => {
    const o = buildAuthOrigin({
      host: "aheedfoodcentre.nocaped.com",
      proto: "https",
      vendorHosts: VENDOR_HOSTS,
      familyDomain,
    });
    expect(o.crossSubDomainCookies).toEqual({ enabled: true, domain: familyDomain });
  });

  it("keeps a custom-domain vendor isolated even when the family config is on", () => {
    const o = buildAuthOrigin({
      host: "srimart.nocaped.com",
      proto: "https",
      vendorHosts: VENDOR_HOSTS,
      familyDomain,
    });
    expect(o.crossSubDomainCookies).toBeUndefined();
  });

  it("does not match a look-alike suffix substring (dot-boundary only)", () => {
    const o = buildAuthOrigin({
      host: "evilaheedfoodcentre.nocaped.com",
      proto: "https",
      vendorHosts: VENDOR_HOSTS,
      familyDomain,
    });
    expect(o.crossSubDomainCookies).toBeUndefined();
  });

  it("treats an empty-string familyDomain as unset (host-only)", () => {
    const o = buildAuthOrigin({
      host: "shop.aheedfoodcentre.nocaped.com",
      proto: "https",
      vendorHosts: VENDOR_HOSTS,
      familyDomain: "   ",
    });
    expect(o.crossSubDomainCookies).toBeUndefined();
  });
});
