import { describe, expect, it } from "vitest";
import {
  isOwnDomainHost,
  isRoutableSenderDomain,
  suggestSender,
  type StoreHost,
} from "@/lib/client-setup/sender-suggestion";

/**
 * #1403 R12–R13 (the suggested sender rule replaced by #1419) — the suggested sender and the routable-sender check. Store names and hosts here
 * are neutral fixtures.
 */

const PLATFORM = "platform.test";
const host = (h: string, isCanonical = true): StoreHost => ({ host: h, isCanonical });
// `null` means "no EMAIL_FROM"; a default parameter would swallow an explicit undefined.
const suggest = (hosts: StoreHost[], platformDomain: string | null = PLATFORM) =>
  suggestSender({
    vendorName: "Corner Shop",
    slug: "corner",
    hosts,
    platformDomain: platformDomain ?? undefined,
  });

describe("suggestSender (#1419 R1-R4)", () => {
  it("R1: uses a custom canonical host", () => {
    expect(suggest([host("cornershop.example")])).toEqual({
      name: "Corner Shop",
      email: "info@cornershop.example",
    });
  });

  it("R1: strips one leading www.", () => {
    expect(suggest([host("www.cornershop.example")])?.email).toBe("info@cornershop.example");
  });

  it("R1: prefers the canonical custom host over an alphabetically earlier one", () => {
    expect(suggest([host("aaa-shop.example", false), host("zzz-shop.example", true)])?.email).toBe(
      "info@zzz-shop.example",
    );
  });

  it("R1: falls back to the alphabetically first custom host when none is canonical", () => {
    expect(suggest([host("zzz-shop.example", false), host("bbb-shop.example", false)])?.email).toBe(
      "info@bbb-shop.example",
    );
  });

  it("R1: uses the custom host when there is no platform domain", () => {
    expect(suggest([host("cornershop.example")], null)?.email).toBe("info@cornershop.example");
  });

  it("R1: a custom host beats a canonical platform subdomain", () => {
    expect(
      suggest([host("corner.platform.test", true), host("cornershop.example", false)])?.email,
    ).toBe("info@cornershop.example");
  });

  it("R2: uses the platform subdomain's label", () => {
    expect(suggest([host("corner.platform.test")])).toEqual({
      name: "Corner Shop",
      email: "info-corner@platform.test",
    });
  });

  it("R2: prefers the canonical subdomain over an alphabetically earlier one", () => {
    expect(
      suggest([host("corner.platform.test", false), host("corner-staging.platform.test", true)])
        ?.email,
    ).toBe("info-corner-staging@platform.test");
  });

  it("R2: falls back to the alphabetically first subdomain when none is canonical", () => {
    expect(
      suggest([host("zed.platform.test", false), host("corner-staging.platform.test", false)])
        ?.email,
    ).toBe("info-corner-staging@platform.test");
  });

  it("R2: is case-insensitive and lower-cases the label", () => {
    expect(suggest([host("Corner.PLATFORM.test")], "Platform.Test")?.email).toBe(
      "info-corner@platform.test",
    );
  });

  it("R3: a host equal to the platform domain falls back to the slug", () => {
    expect(suggest([host("platform.test")])?.email).toBe("info-corner@platform.test");
  });

  it("R3: a multi-level platform host falls back to the slug", () => {
    expect(suggest([host("a.b.platform.test")])?.email).toBe("info-corner@platform.test");
  });

  it("R3: dev hosts only fall back to the slug", () => {
    expect(
      suggest([
        host("localhost:8787"),
        host("corner.localhost:8787"),
        host("corner.localhost"),
        host("localhost"),
        host("127.0.0.1"),
      ])?.email,
    ).toBe("info-corner@platform.test");
  });

  it("R3: no hosts falls back to the slug", () => {
    expect(suggest([])?.email).toBe("info-corner@platform.test");
  });

  it("R4: returns null with no platform domain and no custom host", () => {
    expect(suggest([], null)).toBeNull();
    expect(suggest([host("localhost:8787")], null)).toBeNull();
  });
});

describe("isRoutableSenderDomain (R13)", () => {
  const routable = (
    senderEmail: string,
    hosts: StoreHost[] = [],
    verifiedDomains: string[] = [],
    platformDomain: string | undefined = PLATFORM,
  ) => isRoutableSenderDomain({ senderEmail, hosts, platformDomain, verifiedDomains });

  it("is true for the platform domain", () => {
    expect(routable("orders-corner@platform.test")).toBe(true);
  });

  it("is true for one of the store's own domains, www. stripped", () => {
    expect(routable("orders@cornershop.example", [host("www.cornershop.example")])).toBe(true);
  });

  it("is true for a domain in EMAIL_VERIFIED_DOMAINS", () => {
    expect(routable("orders@mail.example", [], ["mail.example"])).toBe(true);
  });

  it("is false for a nocaped sender when the store's hosts are on merqify (the #1403 case)", () => {
    expect(
      isRoutableSenderDomain({
        senderEmail: "orders@corner.nocaped.com",
        hosts: [host("corner.merqify.com"), host("corner-staging.merqify.com")],
        platformDomain: "merqify.com",
        verifiedDomains: [],
      }),
    ).toBe(false);
  });

  it("is false for an empty sender, and for a dev host's domain", () => {
    expect(routable("")).toBe(false);
    expect(routable("orders@localhost", [host("localhost")])).toBe(false);
  });

  it("compares case-insensitively", () => {
    expect(routable("Orders@CornerShop.Example", [host("cornershop.example")])).toBe(true);
    expect(routable("orders@PLATFORM.TEST")).toBe(true);
    expect(routable("orders@Mail.Example", [], ["MAIL.example"])).toBe(true);
  });
});

describe("isOwnDomainHost (#1409 R6)", () => {
  it("is true for a store domain outside the platform", () => {
    expect(isOwnDomainHost("srimart.co.uk", "merqify.com")).toBe(true);
    expect(isOwnDomainHost("Shop.Example.COM", "merqify.com")).toBe(true);
  });

  it.each([
    "aheed.merqify.com",
    "merqify.com",
    "x.localhost",
    "localhost:8787",
    "127.0.0.1",
    "localhost",
  ])("is false for %s", (host) => {
    expect(isOwnDomainHost(host, "merqify.com")).toBe(false);
  });

  it("with no platform domain, every eligible host counts", () => {
    expect(isOwnDomainHost("a.com", undefined)).toBe(true);
    expect(isOwnDomainHost("a.localhost", undefined)).toBe(false);
  });
});
