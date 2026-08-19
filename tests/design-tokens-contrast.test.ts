import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Proves R7/R8 (#251, P7 closeout): every colour pair the storefront actually
 * renders clears WCAG 2.2 AA at 4.5:1.
 *
 * This reads `design-system/tokens/tokens.css` rather than a copy of the values,
 * so the test fails when someone edits the tokens — which is the entire point.
 * Three of these tokens were darkened by this slice because the exact brand-kit
 * hex values fail AA in the combinations the UI renders (see the comment in
 * tokens.css); without this test, a future "restore the brand colours" edit
 * would silently undo that with nothing to catch it.
 *
 * No browser and no DOM: `@theme` is a flat block of literal hex behind at most
 * one layer of `var()`, so resolving it is a regex and a lookup.
 */

const TOKENS_PATH = fileURLToPath(new URL("../design-system/tokens/tokens.css", import.meta.url));

/** Every `--name: value;` declaration in the file, value unresolved. */
function readRawTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

/** Follow `var(--x)` indirection until a literal hex value is reached. */
function resolve(tokens: Map<string, string>, name: string, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`circular token reference at ${name}`);
  seen.add(name);

  const raw = tokens.get(name);
  if (raw === undefined) throw new Error(`no such token: ${name}`);

  const varRef = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
  if (varRef) return resolve(tokens, varRef[1], seen);

  if (!/^#[0-9a-f]{6}$/i.test(raw)) {
    throw new Error(`token ${name} does not resolve to a 6-digit hex value (got "${raw}")`);
  }
  return raw.toLowerCase();
}

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, always at least 1. */
function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = "#ffffff";
/** `app/globals.css` sets `body { color: #212121 }` — brand kit "Text / Dark". */
const INK = "#212121";

/**
 * The pairs the storefront actually renders, as `[foreground, background]`.
 * Token names resolve through tokens.css; literals are the two colours that
 * live in globals.css rather than the token file.
 *
 * AA at 4.5:1 is asserted for all of them rather than allowing the 3:1
 * large-text threshold anywhere: every one of these pairs is used for
 * normal-size text somewhere in the app, so a large-text carve-out would not
 * be honest about what is on screen.
 */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  // coloured text on the page background
  ["--color-primary", WHITE],
  ["--color-action", WHITE],
  ["--color-accent", WHITE],
  ["--color-danger", WHITE],
  [INK, WHITE],
  // white text on filled buttons and badges
  [WHITE, "--color-primary"],
  [WHITE, "--color-action"],
  [WHITE, "--color-accent"],
  [WHITE, "--color-danger"],
  [WHITE, "--color-action-hover"],
  [WHITE, "--color-accent-hover"],
  // coloured text on its matching tint — banners, badges, error messages
  ["--color-primary", "--color-action-tint"],
  ["--color-action", "--color-action-tint"],
  ["--color-accent", "--color-accent-tint"],
  ["--color-danger", "--color-danger-tint"],
  // text on the muted surface
  [INK, "--color-surface-muted"],
  ["--color-primary", "--color-surface-muted"],
];

const AA_NORMAL_TEXT = 4.5;

describe("design token contrast (WCAG 2.2 AA)", () => {
  const tokens = readRawTokens(readFileSync(TOKENS_PATH, "utf8"));
  const asHex = (value: string) => (value.startsWith("--") ? resolve(tokens, value) : value);

  it("declares at least 17 pairs, so the suite cannot pass vacuously", () => {
    expect(PAIRS.length).toBeGreaterThanOrEqual(17);
  });

  it("keeps the brand primitives at their exact brand-kit values", () => {
    // The slice darkened the SEMANTIC layer only. If these ever change, it is a
    // brand decision and not something a contrast fix should have done.
    expect(resolve(tokens, "--color-brand-green")).toBe("#4caf50");
    expect(resolve(tokens, "--color-brand-orange")).toBe("#f57c00");
    expect(resolve(tokens, "--color-brand-red")).toBe("#d32f2f");
    expect(resolve(tokens, "--color-brand-green-dark")).toBe("#1b5e20");
  });

  it.each(PAIRS)("%s on %s meets 4.5:1", (foreground, background) => {
    const ratio = contrastRatio(asHex(foreground), asHex(background));
    expect(
      ratio,
      `${foreground} on ${background} is ${ratio.toFixed(2)}:1, below the ${AA_NORMAL_TEXT}:1 AA threshold`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
