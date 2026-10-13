import { describe, expect, it } from "vitest";
import {
  buildManifestIcons,
  buildVendorIconMetadata,
  faviconRedirectUrl,
  markUrls,
} from "@/lib/vendor-icons";

/** #1069 R11, R16 — every head/manifest/favicon URL comes from these, or nothing does. */

const CDN = "https://cdn.example.com";
const A = "a4ed0000-0000-4000-a000-000000000001";
const B = "5e1a0000-0000-4000-a000-000000000002";
const UUID = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const KEY_A = `vendors/${A}/mark-${UUID}/512.png`;
const KEY_B = `vendors/${B}/mark-${UUID}/512.png`;
const BASE_A = `${CDN}/vendors/${A}/mark-${UUID}`;

describe("buildVendorIconMetadata", () => {
  it("emits the favicon, apple-touch icon and Open Graph image for a vendor with a mark", () => {
    expect(buildVendorIconMetadata("Example Store", KEY_A, CDN)).toEqual({
      icons: {
        icon: [
          { url: `${BASE_A}/32.png`, sizes: "32x32", type: "image/png" },
          { url: `${BASE_A}/192.png`, sizes: "192x192", type: "image/png" },
        ],
        apple: [{ url: `${BASE_A}/180.png`, sizes: "180x180", type: "image/png" }],
      },
      openGraph: {
        siteName: "Example Store",
        type: "website",
        images: [{ url: `${BASE_A}/og.png`, width: 1200, height: 630, alt: "Example Store" }],
      },
    });
  });

  it.each([
    ["a null key", null, CDN],
    ["an unset CDN base", KEY_A, undefined],
    ["an empty CDN base", KEY_A, ""],
    ["a malformed key", `vendors/${A}/logo-${UUID}.webp`, CDN],
  ])("adds no keys at all for %s (R11, R13)", (_label, key, cdn) => {
    const result = buildVendorIconMetadata("Example Store", key, cdn);
    expect(result).toEqual({});
    expect(Object.keys({ title: "t", description: "d", ...result })).toEqual([
      "title",
      "description",
    ]);
    expect(buildManifestIcons(key, cdn)).toEqual([]);
    expect(faviconRedirectUrl(key, cdn)).toBeNull();
  });
});

describe("buildManifestIcons (R14)", () => {
  it("lists exactly the 192 and 512 PNGs", () => {
    expect(buildManifestIcons(KEY_A, CDN)).toEqual([
      { src: `${BASE_A}/192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE_A}/512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
    ]);
  });
});

describe("faviconRedirectUrl (R15)", () => {
  it("is the 32px PNG", () => {
    expect(faviconRedirectUrl(KEY_A, `${CDN}/`)).toBe(`${BASE_A}/32.png`);
  });
});

describe("per-vendor isolation (R16)", () => {
  it("each vendor's URLs carry only its own prefix", () => {
    const a = Object.values(markUrls(KEY_A, CDN)!);
    const b = Object.values(markUrls(KEY_B, CDN)!);
    expect(a.every((u) => u.includes(`vendors/${A}/`) && !u.includes(B))).toBe(true);
    expect(b.every((u) => u.includes(`vendors/${B}/`) && !u.includes(A))).toBe(true);
  });
});
