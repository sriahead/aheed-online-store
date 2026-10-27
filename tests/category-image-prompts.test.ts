import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCategoryImagePrompt,
  buildSlotAssetPrompt,
  CIRCULAR_FRAMING_CLAUSE,
  type CategoryImageStyle,
} from "@/lib/category-image";
import { ICON_SLOTS } from "@/lib/icon-slots";

/** #1288 R20-R22: prompts framed for the circular medallion, coloured by the vendor's palette. */

const PALETTE = { primary: "#123456", accent: "#abcdef" };
const STYLES: CategoryImageStyle[] = ["photo", "3d-icon"];

describe("CIRCULAR_FRAMING_CLAUSE (#1288 R20)", () => {
  it("asks for a circle-safe subject on a white background", () => {
    expect(CIRCULAR_FRAMING_CLAUSE).toContain("circle");
    expect(CIRCULAR_FRAMING_CLAUSE).toContain("white background");
  });

  it.each(STYLES)("ends every slot prompt and carries the palette (%s)", (style) => {
    for (const slot of ICON_SLOTS) {
      const prompt = buildSlotAssetPrompt(slot.id, style, PALETTE);
      expect(prompt.endsWith(CIRCULAR_FRAMING_CLAUSE), slot.id).toBe(true);
      expect(prompt, slot.id).toContain(PALETTE.primary);
      expect(prompt, slot.id).toContain(PALETTE.accent);
    }
  });

  it.each(STYLES)("ends the category prompt and carries the palette (%s)", (style) => {
    const prompt = buildCategoryImagePrompt("Bakery", style, PALETTE);
    expect(prompt.endsWith(CIRCULAR_FRAMING_CLAUSE)).toBe(true);
    expect(prompt).toContain(PALETTE.primary);
    expect(prompt).toContain(PALETTE.accent);
    expect(prompt).toContain("Bakery");
  });
});

describe("no vendor palette hardcoded (#1288 R21)", () => {
  const source = readFileSync("lib/category-image.ts", "utf8");

  it("has no hex colour other than white", () => {
    const hexes = source.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(hexes.filter((hex) => hex.toLowerCase() !== "#ffffff")).toEqual([]);
  });

  it("names no vendor and no vendor colour", () => {
    expect(source).not.toMatch(/emerald|navy|aheed|srimart/i);
  });
});

describe("flat slot subjects (#1288 R22)", () => {
  it("uses the Noto id as the subject", () => {
    expect(buildSlotAssetPrompt("icon:apple", "3d-icon", PALETTE)).toContain("red apple");
    expect(buildSlotAssetPrompt("icon:package", "3d-icon", PALETTE)).toContain("package");
  });
});
