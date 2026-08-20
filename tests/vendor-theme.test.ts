import { describe, expect, it } from "vitest";
import { brandStyle } from "@/lib/vendor-theme";
import { contrastRatio, hexToOklch } from "@/lib/color-contrast";
import type { BrandPrimitives } from "@/lib/repositories/vendor";

/**
 * Proves R29-R32 (#255, P7.5c+f) — every semantic FOREGROUND `brandStyle()`
 * injects clears WCAG 2.2 AA for both seeded vendors.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM tests/design-tokens-contrast.test.ts.
 * That file parses `design-system/tokens/tokens.css` and proves the STYLESHEET
 * is right. It cannot prove what a browser renders, because `brandStyle()`'s
 * return value is applied as an inline style on the root element and an inline
 * style outranks a `:root` rule. In #251 the stylesheet was correct, that test
 * passed, and every real page still served AA-failing colour. This file closes
 * the half of the gap a unit test can close.
 *
 * It still cannot prove the values REACH the page — only validation.md's live
 * two-host fetch does that (R33). Do not treat this file as sufficient.
 */

const WHITE = "#ffffff";
const AA_NORMAL = 4.5;

/**
 * SriMart's real seeded primitives (`prisma/seed.ts`, SRIMART_SATELLITES) — a
 * blue/purple palette, deliberately nothing like Aheed's green/orange. Kept as a
 * literal rather than imported because `prisma/seed.ts` runs `main()` on import.
 * If the seed's palette changes, change it here too.
 */
const SRIMART_PRIMITIVES: BrandPrimitives = {
  "green-dark": "#0d47a1",
  green: "#1e88e5",
  orange: "#8e24aa",
  red: "#c62828",
  cream: "#eef2f8",
  "green-tint": "#e3f2fd",
  "orange-tint": "#f3e5f5",
  "red-tint": "#ffebee",
};

/**
 * Aheed's seeded primitives — identical to `DEFAULT_BRAND_PRIMITIVES` in
 * `lib/repositories/vendor.ts` and to `tokens.css`'s `--color-brand-*`.
 * Duplicated as a literal rather than imported for the same reason SriMart's is:
 * importing that module pulls in `lib/db.ts`, whose `@prisma/client/wasm`
 * specifier does not resolve under vitest's Node environment. `brandStyle()`
 * takes primitives as a plain argument precisely so this file needs neither a
 * database nor a mock of one.
 */
const AHEED_PRIMITIVES: BrandPrimitives = {
  "green-dark": "#1b5e20",
  green: "#4caf50",
  orange: "#f57c00",
  red: "#d32f2f",
  cream: "#f5f5f0",
  "green-tint": "#e8f5e9",
  "orange-tint": "#fff3e0",
  "red-tint": "#ffebee",
};

const VENDORS: ReadonlyArray<readonly [string, BrandPrimitives]> = [
  ["Aheed", AHEED_PRIMITIVES],
  ["SriMart", SRIMART_PRIMITIVES],
];

describe("brandStyle", () => {
  // R29
  it("declares every primitive, foreground and background token", () => {
    const keys = Object.keys(brandStyle(AHEED_PRIMITIVES));
    for (const expected of [
      "--color-brand-green-dark",
      "--color-brand-green",
      "--color-brand-orange",
      "--color-brand-red",
      "--color-brand-cream",
      "--color-brand-green-tint",
      "--color-brand-orange-tint",
      "--color-brand-red-tint",
      "--color-primary",
      "--color-action",
      "--color-accent",
      "--color-danger",
      "--color-action-hover",
      "--color-accent-hover",
      "--color-surface-muted",
      "--color-action-tint",
      "--color-accent-tint",
      "--color-danger-tint",
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it("passes the vendor's raw primitives through unclamped", () => {
    for (const [, primitives] of VENDORS) {
      const style = brandStyle(primitives) as Record<string, string>;
      expect(style["--color-brand-green"]).toBe(primitives.green);
      expect(style["--color-brand-orange"]).toBe(primitives.orange);
      expect(style["--color-brand-red"]).toBe(primitives.red);
    }
  });

  // R30 — the base foregrounds.
  it.each(VENDORS)("%s's action/accent/danger meet AA against white", (_name, primitives) => {
    const style = brandStyle(primitives) as Record<string, string>;
    for (const token of ["--color-action", "--color-accent", "--color-danger"]) {
      expect(contrastRatio(style[token], WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  // R30 — hover shades, the thing most likely to be forgotten.
  it.each(VENDORS)("%s's hover shades are darker and still meet AA", (_name, primitives) => {
    const style = brandStyle(primitives) as Record<string, string>;
    for (const [base, hover] of [
      ["--color-action", "--color-action-hover"],
      ["--color-accent", "--color-accent-hover"],
    ]) {
      expect(hexToOklch(style[hover]).l).toBeLessThan(hexToOklch(style[base]).l);
      expect(contrastRatio(style[hover], WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  // R31 — proves the clamp actually ran rather than the raw value passing
  // through. Both vendors' greens fail AA raw (2.78:1 and 3.68:1), so an
  // unchanged value here means the transform was bypassed.
  it("does not emit either vendor's raw green as --color-action", () => {
    const aheed = brandStyle(AHEED_PRIMITIVES) as Record<string, string>;
    const srimart = brandStyle(SRIMART_PRIMITIVES) as Record<string, string>;
    expect(aheed["--color-action"]).not.toBe("#4caf50");
    expect(srimart["--color-action"]).not.toBe("#1e88e5");
  });

  // The point of the whole slice: vendors stay visibly different from each
  // other. An AA guarantee that made every vendor identical would pass every
  // other assertion in this file (#255's actual complaint).
  it("keeps the two vendors visually distinct", () => {
    const aheed = brandStyle(AHEED_PRIMITIVES) as Record<string, string>;
    const srimart = brandStyle(SRIMART_PRIMITIVES) as Record<string, string>;
    for (const token of ["--color-primary", "--color-action", "--color-accent"]) {
      expect(aheed[token]).not.toBe(srimart[token]);
    }
  });

  // R32 — --color-primary renders on white, on the vendor's cream, and on all
  // three tints (`bg-action-tint text-primary` in the trust strip).
  it.each(VENDORS)("%s's --color-primary meets AA on every surface", (_name, primitives) => {
    const style = brandStyle(primitives) as Record<string, string>;
    const surfaces = [
      WHITE,
      primitives.cream,
      primitives["green-tint"],
      primitives["orange-tint"],
      primitives["red-tint"],
    ];
    for (const surface of surfaces) {
      expect(contrastRatio(style["--color-primary"], surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
