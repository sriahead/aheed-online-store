import { describe, it, expect } from "vitest";
import { buildAuthOrigin, inferProto, splitHostPort } from "@/lib/auth-origin";

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

describe("buildAuthOrigin — port handling (#176)", () => {
  it("keeps a non-default port, so a local preview origin matches the browser's", () => {
    const o = buildAuthOrigin({ host: "localhost:8787", proto: "http" });
    expect(o.baseURL).toBe("http://localhost:8787");
    expect(o.trustedOrigins).toEqual(["http://localhost:8787"]);
  });

  it("strips :443 under https, because browsers omit it from Origin", () => {
    const o = buildAuthOrigin({ host: "aheedfoodcentre.nocaped.com:443", proto: "https" });
    expect(o.baseURL).toBe("https://aheedfoodcentre.nocaped.com");
  });

  it("strips :80 under http for the same reason", () => {
    const o = buildAuthOrigin({ host: "localhost:80", proto: "http" });
    expect(o.baseURL).toBe("http://localhost");
  });

  it("does not strip :443 when the scheme is http (not that scheme's default)", () => {
    const o = buildAuthOrigin({ host: "localhost:443", proto: "http" });
    expect(o.baseURL).toBe("http://localhost:443");
  });

  it("keeps a bracketed IPv6 literal intact with its port", () => {
    const o = buildAuthOrigin({ host: "[::1]:8787", proto: "http" });
    expect(o.baseURL).toBe("http://[::1]:8787");
  });

  it("leaves a portless host exactly as before", () => {
    const o = buildAuthOrigin({ host: "aheedfoodcentre.nocaped.com", proto: "https" });
    expect(o.baseURL).toBe("https://aheedfoodcentre.nocaped.com");
  });
});

describe("splitHostPort", () => {
  it("splits a plain host and port", () => {
    expect(splitHostPort("localhost:8787")).toEqual({ hostname: "localhost", port: "8787" });
  });

  it("returns no port when there is none", () => {
    expect(splitHostPort("example.com")).toEqual({ hostname: "example.com" });
  });

  it("splits a bracketed IPv6 literal on the bracket, not the first colon", () => {
    expect(splitHostPort("[::1]:8787")).toEqual({ hostname: "[::1]", port: "8787" });
  });

  it("handles a bracketed IPv6 literal with no port", () => {
    expect(splitHostPort("[::1]")).toEqual({ hostname: "[::1]" });
  });
});

describe("inferProto (#176)", () => {
  it("uses x-forwarded-proto for a public host", () => {
    expect(inferProto("aheedfoodcentre.nocaped.com", "https")).toBe("https");
    expect(inferProto("aheedfoodcentre.nocaped.com", "http")).toBe("http");
  });

  it("takes the first value of a comma-joined header", () => {
    expect(inferProto("aheedfoodcentre.nocaped.com", "https,http")).toBe("https");
  });

  it("forces http for loopback even when x-forwarded-proto claims https", () => {
    // This is the actual #176 defect: `wrangler dev` sets the header to https
    // on a connection it serves over plain http. Verified against a running
    // Worker, not assumed.
    expect(inferProto("localhost:8787", "https")).toBe("http");
    expect(inferProto("127.0.0.1:8787", "https")).toBe("http");
    expect(inferProto("[::1]:8787", "https")).toBe("http");
  });

  it("uses http for loopback when the header is absent too", () => {
    expect(inferProto("localhost:8787", null)).toBe("http");
    expect(inferProto("127.0.0.1", undefined)).toBe("http");
    expect(inferProto("[::1]:8787", "")).toBe("http");
  });

  it("still falls back to https for a public host with no forwarded proto", () => {
    expect(inferProto("aheedfoodcentre.nocaped.com", null)).toBe("https");
  });

  it("does not treat a look-alike hostname as loopback", () => {
    expect(inferProto("localhost.evil.com", "https")).toBe("https");
    expect(inferProto("notlocalhost", null)).toBe("https");
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

  it("matches the family on the portless hostname, keeping the port in the origin", () => {
    const o = buildAuthOrigin({
      host: "shop.aheedfoodcentre.nocaped.com:8787",
      proto: "http",
      familyDomain,
    });
    expect(o.crossSubDomainCookies).toEqual({ enabled: true, domain: familyDomain });
    expect(o.baseURL).toBe("http://shop.aheedfoodcentre.nocaped.com:8787");
    expect(o.trustedOrigins).toContain("https://*.aheedfoodcentre.nocaped.com");
  });

  it("still rejects a look-alike suffix when a port is present", () => {
    const o = buildAuthOrigin({
      host: "evilaheedfoodcentre.nocaped.com:8787",
      proto: "http",
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
