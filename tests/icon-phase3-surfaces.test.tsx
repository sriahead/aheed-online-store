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

describe("Phase 3 registry names (R38)", () => {
  it("the Phosphor entries are exactly the nine new decorative names", () => {
    const phosphor = Object.entries(ICON_REGISTRY)
      .filter(([, entry]) => entry.provider === "ph")
      .map(([name]) => name)
      .sort();
    expect(phosphor).toEqual(
      [
        "rewards-bag",
        "rewards-coins",
        "rewards-discount",
        "rewards-gift",
        "rewards-invite",
        "rewards-sparkles",
        "trust-delivery",
        "trust-payment",
        "trust-updates",
      ].sort(),
    );
    for (const name of phosphor) {
      expect(ICON_REGISTRY[name as IconName].tier, name).toBe("decorative");
    }
  });

  it("every name the surfaces use is one of them", () => {
    for (const name of PHASE3_NAMES) {
      expect(ICON_REGISTRY[name].provider, name).toBe("ph");
    }
  });

  it("the Lucide originals keep their provider and tier (a decorative variant gets a new key)", () => {
    expect(ICON_REGISTRY.gift).toMatchObject({ provider: "lucide", tier: "decorative" });
    expect(ICON_REGISTRY.truck).toMatchObject({ provider: "lucide", tier: "decorative" });
    expect(ICON_REGISTRY.sparkles).toMatchObject({ provider: "lucide", tier: "decorative" });
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

describe("a two-hue glyph in markup (R39)", () => {
  it.each(PHASE3_NAMES)("%s carries --icon-secondary and no colour literal", (name) => {
    const html = renderToStaticMarkup(<Icon name={name} tone="accent" />);
    expect(html).toContain("--icon-secondary");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("a tone sets the second hue from a vendor token, and none sets nothing", () => {
    const toned = renderToStaticMarkup(<Icon name="rewards-gift" tone="action" />);
    expect(toned).toContain("--icon-secondary:var(--color-accent)");
    const plain = renderToStaticMarkup(<Icon name="rewards-gift" />);
    expect(plain).not.toContain("--icon-secondary:var(");
  });
});
