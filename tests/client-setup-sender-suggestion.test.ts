import { describe, expect, it } from "vitest";
import {
  isRoutableSenderDomain,
  suggestSender,
  type StoreHost,
} from "@/lib/client-setup/sender-suggestion";

/**
 * #1403 R12–R13 — the suggested sender and the routable-sender check. Store names and hosts here
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

describe("suggestSender (R12)", () => {
  it("uses a custom canonical host", () => {
    expect(suggest([host("cornershop.example")])).toEqual({
      name: "Corner Shop",
      email: "orders@cornershop.example",
    });
  });

  it("strips one leading www.", () => {
    expect(suggest([host("www.cornershop.example")])?.email).toBe("orders@cornershop.example");
  });

  it("prefers the canonical custom host over an alphabetically earlier one", () => {
    expect(suggest([host("aaa-shop.example", false), host("zzz-shop.example", true)])?.email).toBe(
      "orders@zzz-shop.example",
    );
  });

  it("falls back to the alphabetically first custom host when none is canonical", () => {
    expect(suggest([host("zzz-shop.example", false), host("bbb-shop.example", false)])?.email).toBe(
      "orders@bbb-shop.example",
    );
  });

  it("gives the flat form when every host is on the platform domain", () => {
    expect(suggest([host("corner.platform.test"), host("corner-staging.platform.test")])).toEqual({
      name: "Corner Shop",
      email: "orders-corner@platform.test",
    });
  });

  it("counts a host equal to the platform domain as a platform host", () => {
    expect(suggest([host("platform.test")])?.email).toBe("orders-corner@platform.test");
  });

  it("returns null with no platform domain and no custom host", () => {
    expect(suggest([], null)).toBeNull();
    expect(suggest([host("localhost:8787")], null)).toBeNull();
  });

  it("uses the custom host when there is no platform domain", () => {
    expect(suggest([host("cornershop.example")], null)?.email).toBe("orders@cornershop.example");
  });

  it("ignores dev hosts: ports, localhost, *.localhost and IPv4 literals", () => {
    expect(
      suggest([
        host("localhost:8787"),
        host("corner.localhost:8787"),
        host("corner.localhost"),
        host("localhost"),
        host("127.0.0.1"),
      ])?.email,
    ).toBe("orders-corner@platform.test");
  });

  it("is case-insensitive about hosts and the platform domain", () => {
    expect(suggest([host("WWW.CornerShop.Example")], "Platform.Test")?.email).toBe(
      "orders@cornershop.example",
    );
    expect(suggest([host("Corner.PLATFORM.test")], "platform.test")?.email).toBe(
      "orders-corner@platform.test",
    );
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
