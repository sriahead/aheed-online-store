import { describe, expect, it } from "vitest";
import {
  MARK_FILES,
  buildVendorMarkFolder,
  containInSquare,
  isVendorMarkKey,
  markEdgeFor,
  markFileKeys,
} from "@/lib/vendor-mark";

/** #1069 R2 — the mark's key shape is defined once, here. */

const A = "a4ed0000-0000-4000-a000-000000000001";
const B = "5e1a0000-0000-4000-a000-000000000002";
const UUID = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const KEY = `vendors/${A}/mark-${UUID}/512.png`;

describe("buildVendorMarkFolder", () => {
  it("is vendors/{vendorId}/mark-{uuid}, fresh on every call", () => {
    const one = buildVendorMarkFolder(A);
    const two = buildVendorMarkFolder(A);
    expect(one).toMatch(
      new RegExp(
        `^vendors/${A}/mark-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
      ),
    );
    expect(one).not.toBe(two);
    expect(markFileKeys(`${one}/512.png`)).not.toBeNull();
  });
});

describe("markFileKeys", () => {
  it("derives the five sibling keys from the stored 512.png key", () => {
    const folder = `vendors/${A}/mark-${UUID}`;
    expect(markFileKeys(KEY)).toEqual({
      icon32: `${folder}/32.png`,
      apple180: `${folder}/180.png`,
      icon192: `${folder}/192.png`,
      icon512: `${folder}/512.png`,
      og: `${folder}/og.png`,
    });
  });

  it.each([
    ["a .webp suffix", `vendors/${A}/mark-${UUID}/512.webp`],
    ["a sibling, not the 512 file", `vendors/${A}/mark-${UUID}/192.png`],
    ["no mark- segment", `vendors/${A}/${UUID}/512.png`],
    ["a non-UUID folder", `vendors/${A}/mark-not-a-uuid/512.png`],
    ["an uppercase UUID", `vendors/${A}/mark-${UUID.toUpperCase()}/512.png`],
    ["a ../ vendor segment", `vendors/../mark-${UUID}/512.png`],
    ["a nested vendor path", `vendors/${A}/x/mark-${UUID}/512.png`],
    ["a trailing slash", `${KEY}/`],
    ["a leading slash", `/${KEY}`],
    ["a full URL", `https://cdn.example.com/${KEY}`],
    ["the logo's key shape", `vendors/${A}/logo-${UUID}.webp`],
  ])("returns null for %s", (_label, key) => {
    expect(markFileKeys(key)).toBeNull();
  });
});

describe("isVendorMarkKey", () => {
  it("accepts a mark key under the vendor's own prefix", () => {
    expect(isVendorMarkKey(KEY, A)).toBe(true);
  });

  it("rejects vendor B's key checked against vendor A", () => {
    expect(isVendorMarkKey(`vendors/${B}/mark-${UUID}/512.png`, A)).toBe(false);
  });

  it("rejects a malformed key even under the right prefix", () => {
    expect(isVendorMarkKey(`vendors/${A}/mark-${UUID}/og.png`, A)).toBe(false);
  });
});

describe("MARK_FILES", () => {
  it("lists the five files with their sizes, and cream behind only 180 and og", () => {
    expect(MARK_FILES.map((f) => [f.name, f.width, f.height, f.creamBackground])).toEqual([
      ["32.png", 32, 32, false],
      ["180.png", 180, 180, true],
      ["192.png", 192, 192, false],
      ["512.png", 512, 512, false],
      ["og.png", 1200, 630, true],
    ]);
  });
});

describe("containInSquare (R8)", () => {
  it("fills a square file with a square source", () => {
    expect(containInSquare(1000, 1000, 512, 512, 512)).toEqual({
      x: 0,
      y: 0,
      width: 512,
      height: 512,
    });
  });

  it("contains a wide source: full width, centred vertically, never cropped", () => {
    expect(containInSquare(1024, 512, 512, 512, 512)).toEqual({
      x: 0,
      y: 128,
      width: 512,
      height: 256,
    });
  });

  it("contains a tall source: full height, centred horizontally", () => {
    expect(containInSquare(300, 600, 192, 192, 192)).toEqual({
      x: 48,
      y: 0,
      width: 96,
      height: 192,
    });
  });

  it("centres the 480px mark in the 1200x630 og.png", () => {
    const og = MARK_FILES.find((f) => f.id === "og")!;
    expect(markEdgeFor(og)).toBe(480);
    expect(containInSquare(800, 800, og.width, og.height, markEdgeFor(og))).toEqual({
      x: 360,
      y: 75,
      width: 480,
      height: 480,
    });
  });
});
