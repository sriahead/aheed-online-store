import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/color-contrast";
import { brandStyle } from "@/lib/vendor-theme";
import { DEFAULT_BRAND_PRIMITIVES, type BrandPrimitives } from "@/lib/repositories/vendor";

/**
 * Proves #1223 R41 - the tones `Icon` offers are readable on the vendor surfaces they land on, for more
 * than one palette.
 *
 * `Icon`'s tones read the four foreground tokens `brandStyle()` already emits (no token is added), so
 * the contrast guarantee is `brandStyle()`'s clamp. This asserts it for the shipped default and for two
 * deliberately different palettes (a dark green and a purple), because a check that passes only against
 * Aheed's colours proves nothing about the second vendor.
 *
 * Keys are in `BrandPrimitives` order: green-dark, green, orange, red, cream, then the three tints.
 */
const FOREST_GREEN: BrandPrimitives = {
  "green-dark": "#1b4332",
  green: "#40916c",
  orange: "#e07a1f",
  red: "#c1121f",
  cream: "#f4f6f0",
  "green-tint": "#e6f4ea",
  "orange-tint": "#fdebd3",
  "red-tint": "#fbe4e4",
};
const BERRY_BOLD: BrandPrimitives = {
  "green-dark": "#4a148c",
  green: "#7b1fa2",
  orange: "#ff6f00",
  red: "#b71c1c",
  cream: "#f6f0f5",
  "green-tint": "#f1e3f4",
  "orange-tint": "#ffe4c4",
  "red-tint": "#fadada",
};

const PALETTES: Array<[string, BrandPrimitives]> = [
  ["default", DEFAULT_BRAND_PRIMITIVES],
  ["Forest Green", FOREST_GREEN],
  ["Berry Bold", BERRY_BOLD],
];

const AA_NORMAL = 4.5;

describe.each(PALETTES)("icon tone contrast: %s palette (R41)", (_name, primitives) => {
  const style = brandStyle(primitives) as Record<string, string>;
  const white = "#ffffff";
  const cream = primitives.cream;

  // token -> the tints it must also clear (its own matching tint; primary clears all three)
  const cases: Array<[string, string[]]> = [
    [
      "--color-primary",
      [primitives["green-tint"], primitives["orange-tint"], primitives["red-tint"]],
    ],
    ["--color-action", [primitives["green-tint"]]],
    ["--color-accent", [primitives["orange-tint"]]],
    ["--color-danger", [primitives["red-tint"]]],
  ];

  it.each(cases)("%s clears 4.5:1 on white, cream and its tint(s)", (token, tints) => {
    const colour = style[token];
    expect(colour, `${token} is emitted`).toMatch(/^#[0-9a-f]{6}$/i);
    for (const surface of [white, cream, ...tints]) {
      expect(
        contrastRatio(colour, surface),
        `${token} ${colour} on ${surface}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
