import type { CSSProperties } from "react";
import { clampForContrast, hexToOklch, oklchToHex } from "@/lib/color-contrast";
import { brandStyle } from "@/lib/vendor-theme";
import { DEFAULT_BRAND_PRIMITIVES, type BrandPrimitives } from "@/lib/repositories/vendor";

/**
 * The storefront footer's colours (#1055), derived from the vendor's own primitives — never a new
 * literal.
 *
 * The footer sits on the vendor's `--color-primary` (the dark brand colour), so its foregrounds
 * are LIGHT, the opposite of every other themed foreground in `brandStyle()`, which are clamped
 * against light surfaces. They cannot reuse those tokens: Aheed's `--color-accent` on its own dark
 * green measures about 3.1:1. So each one is derived here and clamped against the footer background
 * at AA (4.5:1) — `clampForContrast` lightens when the background is dark.
 *
 * Applied as inline custom properties on `<footer>` and read through Tailwind arbitrary values
 * (`text-[var(--footer-heading)]`); never through an alpha modifier, which would composite the
 * clamped value back below the floor (`tests/token-alpha-purity.test.ts`).
 */

const AA_NORMAL = 4.5;

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** How far below `cream` the secondary text starts, in OKLCH lightness, before the clamp. */
const MUTED_LIGHTNESS_STEP = 0.12;

export interface FooterPalette {
  background: string;
  text: string;
  heading: string;
  muted: string;
}

export function footerPalette(primitives: BrandPrimitives): FooterPalette {
  // The same fail-safe `brandStyle()` applies: a malformed stored primitive falls back to the
  // platform default rather than reaching `hexToOklch`, which throws — and the footer renders on
  // every storefront page, so a throw here would take the whole storefront down.
  const p = { ...DEFAULT_BRAND_PRIMITIVES };
  for (const key of Object.keys(DEFAULT_BRAND_PRIMITIVES) as (keyof BrandPrimitives)[]) {
    if (primitives?.[key] && HEX_PATTERN.test(primitives[key])) p[key] = primitives[key];
  }
  const background = String(brandStyle(p)["--color-primary" as keyof CSSProperties]);
  const cream = hexToOklch(p.cream);
  const mutedSource = oklchToHex({ ...cream, l: Math.max(0, cream.l - MUTED_LIGHTNESS_STEP) });

  return {
    background,
    text: clampForContrast(p.cream, [background], AA_NORMAL),
    heading: clampForContrast(p.orange, [background], AA_NORMAL),
    muted: clampForContrast(mutedSource, [background], AA_NORMAL),
  };
}

/** The palette as the custom properties `StorefrontFooter` reads. */
export function footerStyle(palette: FooterPalette): CSSProperties {
  return {
    "--footer-bg": palette.background,
    "--footer-text": palette.text,
    "--footer-heading": palette.heading,
    "--footer-muted": palette.muted,
  } as CSSProperties;
}
