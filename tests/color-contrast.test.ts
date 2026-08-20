import { describe, expect, it } from "vitest";
import {
  clampForContrast,
  contrastRatio,
  darkenForHover,
  hexToOklch,
  oklchToHex,
} from "@/lib/color-contrast";

/**
 * Proves R24-R28 (#255, P7.5c+f) — the contrast clamp that makes per-vendor
 * semantic colour safe to restore.
 *
 * These are unit tests of pure maths and they are NOT sufficient on their own:
 * `brandStyle()` injects its result as an inline style that outranks
 * `tokens.css`, so what a browser actually renders is only established by
 * validation.md's live two-host fetch. This file proves the transform is
 * correct; it cannot prove the transform reaches the page.
 */

const WHITE = "#ffffff";

/** Smallest angular distance between two hues, wrapping at 360. */
function hueDelta(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

describe("contrastRatio", () => {
  it("matches known WCAG reference pairs", () => {
    expect(contrastRatio("#000000", WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
    // The three platform semantic colours audited in P7 closeout (#251).
    expect(contrastRatio("#2e7d32", WHITE)).toBeCloseTo(5.13, 1);
    expect(contrastRatio("#a85400", WHITE)).toBeCloseTo(5.34, 1);
    expect(contrastRatio("#c82d2d", WHITE)).toBeCloseTo(5.43, 1);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#1e88e5", WHITE)).toBeCloseTo(contrastRatio(WHITE, "#1e88e5"), 10);
  });
});

describe("OKLCH round trip", () => {
  it("returns the original colour for in-gamut values", () => {
    for (const hex of ["#1b5e20", "#1e88e5", "#f57c00", "#8e24aa", "#f5f5f0"]) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });
});

describe("clampForContrast", () => {
  // R25 — an already-passing colour is returned untouched. This is what stops
  // the clamp from quietly restyling the audited platform defaults.
  it("returns its input unchanged when it already passes", () => {
    expect(clampForContrast("#2e7d32", [WHITE], 4.5)).toBe("#2e7d32");
    expect(clampForContrast("#a85400", [WHITE], 4.5)).toBe("#a85400");
    expect(clampForContrast("#c82d2d", [WHITE], 4.5)).toBe("#c82d2d");
  });

  it("returns a 6-digit lowercase hex for every input", () => {
    for (const hex of ["#1e88e5", "#4caf50", "#f57c00", "#d32f2f", "#8e24aa", "#c62828"]) {
      expect(clampForContrast(hex, [WHITE], 4.5)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  // R26 — every seeded primitive clears AA after the clamp, whether or not it
  // needed changing.
  it.each(["#1e88e5", "#4caf50", "#f57c00", "#d32f2f"])(
    "clamps %s to meet 4.5:1 against white",
    (hex) => {
      const result = clampForContrast(hex, [WHITE], 4.5);
      expect(contrastRatio(result, WHITE)).toBeGreaterThanOrEqual(4.5);
    },
  );

  // R27 — the three that MEASURABLY fail against white: SriMart's blue at
  // 3.68:1, Aheed's green at 2.78:1 and Aheed's orange at 2.70:1. Preserving hue
  // while fixing them is the whole point of working in OKLCH.
  it.each(["#1e88e5", "#4caf50", "#f57c00"])("preserves the hue of %s within 2 degrees", (hex) => {
    const result = clampForContrast(hex, [WHITE], 4.5);
    expect(result).not.toBe(hex);
    expect(hueDelta(hexToOklch(result).h, hexToOklch(hex).h)).toBeLessThanOrEqual(2);
  });

  // The other half of R27, and the reason #d32f2f is not in the list above:
  // Aheed's red measures 4.98:1 and already complies, so the clamp must leave it
  // alone. A failure here means the transform has started damaging compliant
  // colours — fix the transform, not this assertion.
  it("leaves Aheed's already-compliant red untouched", () => {
    expect(contrastRatio("#d32f2f", WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(clampForContrast("#d32f2f", [WHITE], 4.5)).toBe("#d32f2f");
  });

  it("satisfies every background in the list, not just the lightest", () => {
    const backgrounds = [WHITE, "#f5f5f0", "#e8f5e9", "#fff3e0", "#ffebee"];
    const result = clampForContrast("#4caf50", backgrounds, 4.5);
    for (const bg of backgrounds) {
      expect(contrastRatio(result, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // R28 — the degenerate case. A one-directional search would spin here, and
  // returning the input would be a silent AA failure.
  it("terminates and darkens when the foreground equals its background", () => {
    const result = clampForContrast(WHITE, [WHITE], 4.5);
    expect(result).not.toBe(WHITE);
    expect(contrastRatio(result, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("rejects an empty background list rather than passing silently", () => {
    expect(() => clampForContrast("#1e88e5", [], 4.5)).toThrow();
  });
});

describe("darkenForHover", () => {
  it.each(["#2e7d32", "#1e88e5", "#8e24aa"])(
    "returns a strictly darker shade of %s that still meets AA",
    (hex) => {
      const base = clampForContrast(hex, [WHITE], 4.5);
      const hover = darkenForHover(base, [WHITE], 4.5);
      expect(hexToOklch(hover).l).toBeLessThan(hexToOklch(base).l);
      expect(contrastRatio(hover, WHITE)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
