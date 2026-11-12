import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Below `lg` the landing hero stacks, so the carousel has no definite height. A slide carrying
 * `h-full` then cannot stretch (a fixed height overrides `align-items: stretch`), and a slide
 * with short copy left a bare band under its photo. Every slide must stretch to the track.
 */
const source = readFileSync("components/layout/PromotionHero.tsx", "utf8");

describe("PromotionHero slides fill the carousel", () => {
  it("does not pin the slide's height", () => {
    const slide = source.match(/className=\{`dept-panel[^`]*`\}/)?.[0];
    expect(slide).toBeDefined();
    expect(slide).not.toMatch(/\bh-full\b/);
  });

  it("lets the slide copy grow to the slide's height", () => {
    expect(source).toContain('className="relative z-10 flex flex-1 flex-col');
  });
});
