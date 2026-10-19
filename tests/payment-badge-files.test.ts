import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PAYMENT_BADGE_DETAILS } from "@/lib/payment-badges";

/**
 * #1169 R12 — the footer's payment badges are real brand marks, not the #1055 text placeholders.
 *
 * Each file is the brand's Simple Icons glyph (CC0) on the white tile the placeholders used, kept at
 * the same path so `PAYMENT_BADGE_DETAILS` and the footer need no change. A file still carrying
 * `<text>` or the word "placeholder" is the old placeholder back again.
 */

const SIMPLE_ICONS_SLUG: Record<string, string> = {
  VISA: "visa",
  MASTERCARD: "mastercard",
  AMEX: "americanexpress",
  APPLE_PAY: "applepay",
  GOOGLE_PAY: "googlepay",
};

describe("payment badge files (#1169 R12)", () => {
  for (const [method, { label, src }] of Object.entries(PAYMENT_BADGE_DETAILS)) {
    it(`${src} is the ${label} mark on a 48x30 tile`, () => {
      const svg = readFileSync(join(process.cwd(), "public", src), "utf8");
      expect(svg).toContain('viewBox="0 0 48 30"');
      expect(svg).not.toMatch(/<text\b/);
      expect(svg).toMatch(/<path\b/);
      const ariaLabel = svg.match(/aria-label="([^"]*)"/)?.[1];
      expect(ariaLabel).toBe(label);
      expect(svg).not.toMatch(/placeholder/i);
      expect(svg).toContain(`slug "${SIMPLE_ICONS_SLUG[method]}"`);
      expect(svg).toContain("CC0");
    });
  }
});
