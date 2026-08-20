/**
 * WCAG contrast maths and a hue-preserving contrast clamp (P7.5c+f, #255).
 *
 * DELIBERATELY ZERO IMPORTS. This module is the thing that decides whether a
 * vendor's colour is safe to render, and `lib/vendor-theme.ts` calls it on every
 * request for both layouts. Keeping it import-free means it cannot reach vendor
 * config, a Prisma client or request context even by accident, and a plain `tsx`
 * script can exercise it directly — the same reasoning `lib/order-totals.ts`
 * carries (P7.5b, #262).
 *
 * WHY A CLAMP RATHER THAN A CURATED PALETTE. Per-vendor `VendorBranding`
 * primitives are free-form hex chosen by whoever onboards a vendor. Measured at
 * P7.5c+f's /propose, against white:
 *
 *     Aheed   #4caf50 (green)   2.78:1   FAIL     <- the vendor live longest
 *     Aheed   #f57c00 (orange)  2.70:1   FAIL
 *     SriMart #1e88e5 (blue)    3.68:1   FAIL 4.5
 *     SriMart #8e24aa (purple)  7.04:1   pass
 *
 * So re-deriving semantic colours from raw primitives — which is what
 * `brandStyle()` did before #251's /fix removed it — breaks Aheed harder than it
 * breaks the vendor the issue was filed about. The clamp is not a guard around an
 * edge case; it is the only reason per-vendor semantic colour is safe to restore
 * at all.
 *
 * HOW IT PRESERVES THE BRAND. The transform runs in OKLCH: lightness moves,
 * hue and chroma do not, so a vendor's blue stays blue rather than becoming a
 * platform-chosen substitute. HSL would be simpler and wrong — its lightness is
 * not perceptual, so an equal step darkens a yellow and a blue by visibly
 * different amounts.
 */

/** A colour in OKLCH: lightness 0..1, chroma >= 0, hue in degrees 0..360. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const HEX = /^#[0-9a-f]{6}$/i;

function parseHex(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new Error(`not a 6-digit hex colour: "${hex}"`);
  const h = hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function toHex(r: number, g: number, b: number): string {
  const part = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** sRGB companding — the same curve WCAG's relative luminance uses. */
function toLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function fromLinear(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** WCAG 2.x relative luminance of a hex colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.x contrast ratio between two hex colours, 1..21. Order-independent —
 * which is why one call covers both `bg-action text-white` and `text-accent` on
 * a white surface.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB hex -> OKLab -> OKLCH (Björn Ottosson's matrices). */
export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = parseHex(hex).map(toLinear);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.sqrt(okA * okA + okB * okB);
  let h = (Math.atan2(okB, okA) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l: okL, c, h };
}

/** OKLCH -> linear sRGB triple, which may fall outside the 0..1 gamut. */
function oklchToLinearRgb({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const GAMUT_EPSILON = 0.0001;

function inGamut([r, g, b]: [number, number, number]): boolean {
  return [r, g, b].every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON);
}

/**
 * OKLCH -> hex, reducing CHROMA (never hue) when the colour falls outside sRGB.
 *
 * Clipping the RGB channels instead would be one line shorter and would shift
 * hue, which is the one property this whole module exists to preserve — a
 * vendor whose blue silently became a slightly different blue would pass every
 * contrast assertion and still look wrong.
 */
export function oklchToHex(colour: Oklch): string {
  let lo = 0;
  let hi = colour.c;

  if (inGamut(oklchToLinearRgb(colour))) {
    const [r, g, b] = oklchToLinearRgb(colour);
    return toHex(fromLinear(r), fromLinear(g), fromLinear(b));
  }

  // Chroma 0 is always in gamut (a grey of this lightness), so this converges.
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearRgb({ ...colour, c: mid }))) lo = mid;
    else hi = mid;
  }

  const [r, g, b] = oklchToLinearRgb({ ...colour, c: lo });
  return toHex(fromLinear(r), fromLinear(g), fromLinear(b));
}

function meetsAll(candidate: string, backgrounds: readonly string[], minRatio: number): boolean {
  return backgrounds.every((bg) => contrastRatio(candidate, bg) >= minRatio);
}

/**
 * Return `hex` unchanged if it already clears `minRatio` against EVERY colour in
 * `backgrounds`; otherwise the nearest colour of the same hue and chroma that
 * does.
 *
 * Lightness is the only axis moved. The search first asks which direction can
 * possibly work — black for light surfaces, white for dark ones — because a
 * foreground can be trapped between two backgrounds it can never satisfy at
 * once, and a naive one-directional loop would spin or silently return a colour
 * that still fails. When neither extreme satisfies every background, the better
 * of the two is returned rather than throwing: a slightly-too-light button is a
 * defect worth catching in a test, but a 500 on the storefront is worse.
 *
 * `backgrounds` takes a LIST rather than a single colour because
 * `--color-primary` is rendered on white, on the vendor's cream surface and on
 * all three tints (`bg-action-tint text-primary` in the trust strip). Satisfying
 * only the lightest of those would leave the others unguarded.
 */
export function clampForContrast(
  hex: string,
  backgrounds: readonly string[],
  minRatio: number,
): string {
  if (backgrounds.length === 0) throw new Error("clampForContrast needs at least one background");
  if (meetsAll(hex, backgrounds, minRatio)) return hex.toLowerCase();

  const source = hexToOklch(hex);
  const darkest = oklchToHex({ ...source, l: 0 });
  const lightest = oklchToHex({ ...source, l: 1 });

  const darkWorks = meetsAll(darkest, backgrounds, minRatio);
  const lightWorks = meetsAll(lightest, backgrounds, minRatio);

  if (!darkWorks && !lightWorks) {
    // No lightness of this hue satisfies every background — return whichever
    // extreme gets closest, so the caller renders something legible-ish and the
    // vendor-theme test fails loudly rather than the page crashing.
    const worst = (candidate: string) =>
      Math.min(...backgrounds.map((bg) => contrastRatio(candidate, bg)));
    return worst(darkest) >= worst(lightest) ? darkest : lightest;
  }

  // Binary search the lightness boundary. `fail` always fails and `pass` always
  // passes, so the invariant holds at every step and 24 halvings resolve L to
  // well under one 8-bit step.
  let fail = source.l;
  let pass = darkWorks ? 0 : 1;

  for (let i = 0; i < 24; i++) {
    const mid = (fail + pass) / 2;
    if (meetsAll(oklchToHex({ ...source, l: mid }), backgrounds, minRatio)) pass = mid;
    else fail = mid;
  }

  return oklchToHex({ ...source, l: pass });
}

/**
 * A darker companion for a base colour — the `:hover` shade. Applied AFTER the
 * clamp and then re-clamped, so a hover state can never be the one thing on the
 * page that fails AA.
 */
export function darkenForHover(
  hex: string,
  backgrounds: readonly string[],
  minRatio: number,
  delta = 0.05,
): string {
  const base = hexToOklch(hex);
  const darker = oklchToHex({ ...base, l: Math.max(0, base.l - delta) });
  return clampForContrast(darker, backgrounds, minRatio);
}
