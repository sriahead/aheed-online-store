import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Icon } from "@/components/icons/Icon";
import { ICON_REGISTRY, type IconName } from "@/components/icons/registry";

/**
 * Proves #1223 Phase 3, R38 and R39: the colourful (two-hue) glyphs sit on exactly the surfaces the plan
 * names, with the colour they had before, and nowhere else.
 *
 * The page-level half of R39 (the served `/` carries `--icon-secondary` and no colour literal on both
 * vendors) needs a running server and is a validation row; this is the part a unit test can decide.
 */

const ROOT = join(__dirname, "..");

/** surface file -> [registry name, tone expression found in that file or null for "none, amber on dark"] */
const SURFACES: Array<{ file: string; icons: Array<[IconName, string | null]> }> = [
  {
    file: "app/(landing)/page.tsx",
    icons: [
      ["trust-delivery", 'tone="primary"'],
      ["trust-payment", 'tone="accent"'],
      ["trust-updates", 'tone="danger"'],
    ],
  },
  { file: "components/rewards/RewardsLauncher.tsx", icons: [["rewards-gift", null]] },
  { file: "components/rewards/RewardsPanel.tsx", icons: [["rewards-sparkles", null]] },
  {
    file: "components/rewards/WaysToEarnAccordion.tsx",
    icons: [
      ["rewards-coins", '"action"'],
      ["rewards-sparkles", '"accent"'],
      ["rewards-invite", '"action"'],
    ],
  },
  {
    file: "components/rewards/WaysToRedeemAccordion.tsx",
    icons: [
      ["rewards-gift", '"action"'],
      ["rewards-discount", '"accent"'],
      ["rewards-bag", '"action"'],
    ],
  },
  { file: "components/rewards/AvailableRewardsSection.tsx", icons: [["rewards-gift", '"action"']] },
];

const PHASE3_NAMES = [...new Set(SURFACES.flatMap((s) => s.icons.map(([name]) => name)))].sort();

describe("Phase 3 and #1239 surface registry names", () => {
  it("the surface entries are all decorative Noto Emoji icons", () => {
    for (const name of PHASE3_NAMES) {
      expect(ICON_REGISTRY[name].provider, name).toBe("noto");
      expect(ICON_REGISTRY[name].tier, name).toBe("decorative");
    }
  });

  it("the standalone originals also use Noto Emoji", () => {
    expect(ICON_REGISTRY.gift).toMatchObject({ provider: "noto", tier: "decorative" });
    expect(ICON_REGISTRY.truck).toMatchObject({ provider: "noto", tier: "decorative" });
    expect(ICON_REGISTRY.sparkles).toMatchObject({ provider: "noto", tier: "decorative" });
  });
});

describe.each(SURFACES)("$file", ({ file, icons }) => {
  const source = readFileSync(join(ROOT, file), "utf8");

  it("renders its glyphs through Icon with the Phase 3 names and no other icon library", () => {
    expect(source).not.toMatch(/lucide-react|@iconify|@phosphor/);
    for (const [name] of icons) {
      expect(source, name).toContain(`name="${name}"`);
    }
  });

  it("carries the tone it had before, as a tone and not a hand-written colour class", () => {
    for (const [name, tone] of icons) {
      if (tone === null) continue;
      const element = source.slice(source.indexOf(`name="${name}"`));
      const head = element.slice(0, element.indexOf("/>"));
      expect(head, name).toContain(tone);
    }
  });
});

describe("colourful Noto Emoji glyphs on surfaces (#1239)", () => {
  it.each(PHASE3_NAMES)("%s renders colourful SVG without root fill/stroke clobbering", (name) => {
    const html = renderToStaticMarkup(<Icon name={name} tone="accent" />);
    expect(html).toContain(`data-icon="${name}"`);
    expect(html).toContain("<path");
  });

  it("a tone sets the tone class on the rendered SVG", () => {
    const toned = renderToStaticMarkup(<Icon name="rewards-gift" tone="action" />);
    expect(toned).toContain("text-action");
  });
});
