import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/color-contrast";
import { footerPalette } from "@/lib/footer-palette";
import { brandStyle } from "@/lib/vendor-theme";
import type { BrandPrimitives } from "@/lib/repositories/vendor";

// The two seeded vendors' primitives (prisma/seed.ts). SriMart is the second-vendor check
// CLAUDE.md asks for: several contrast checks false-positive against Aheed's colours alone.
const AHEED: BrandPrimitives = {
  "green-dark": "#1b5e20",
  green: "#4caf50",
  orange: "#f57c00",
  red: "#d32f2f",
  cream: "#f5f5f0",
  "green-tint": "#e8f5e9",
  "orange-tint": "#fff3e0",
  "red-tint": "#ffebee",
};

const SRIMART: BrandPrimitives = {
  "green-dark": "#0d47a1",
  green: "#1e88e5",
  orange: "#8e24aa",
  red: "#c62828",
  cream: "#eef2f8",
  "green-tint": "#e3f2fd",
  "orange-tint": "#f3e5f5",
  "red-tint": "#ffebee",
};

describe("footerPalette (#1055)", () => {
  for (const [name, primitives] of [
    ["Aheed", AHEED],
    ["SriMart", SRIMART],
  ] as const) {
    describe(name, () => {
      const palette = footerPalette(primitives);

      it("sits on the vendor's own --color-primary", () => {
        expect(palette.background).toBe(brandStyle(primitives)["--color-primary" as never]);
      });

      for (const key of ["text", "heading", "muted"] as const) {
        it(`${key} clears AA (4.5:1) against the footer background`, () => {
          expect(contrastRatio(palette[key], palette.background)).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }

  it("lightens Aheed's orange, which fails AA on its dark green as declared", () => {
    expect(contrastRatio(AHEED.orange, footerPalette(AHEED).background)).toBeLessThan(4.5);
    expect(footerPalette(AHEED).heading).not.toBe(AHEED.orange);
  });

  it("falls back to the default for a malformed primitive instead of throwing", () => {
    const broken = { ...AHEED, cream: "not-a-colour", orange: "" };
    expect(() => footerPalette(broken)).not.toThrow();
    const palette = footerPalette(broken);
    expect(contrastRatio(palette.text, palette.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("gives the two vendors different footers", () => {
    expect(footerPalette(AHEED).background).not.toBe(footerPalette(SRIMART).background);
  });
});
