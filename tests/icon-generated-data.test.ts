import { describe, expect, it } from "vitest";
import { ICON_DATA } from "@/components/icons/generated/icon-data";
import { ICON_REGISTRY } from "@/components/icons/registry";
import { buildIconData } from "../scripts/lib/icon-build";

/**
 * Proves R11, R12 and R14 (#1223): alias ids resolve, the generated data holds exactly the registry's
 * icons, and Phosphor duotone icons are rewritten to read their second colour from a CSS variable.
 *
 * The committed registry uses only Lucide until Phase 3, so the Phosphor half builds a fixture registry
 * through the same `buildIconData` the CLI uses.
 */

const lucideSet = require("@iconify-json/lucide/icons.json") as {
  icons: Record<string, { body: string }>;
  aliases: Record<string, { parent: string }>;
};

describe("generated icon data", () => {
  it("holds exactly the registry's icons, in both directions (R12)", () => {
    const registered = Object.keys(ICON_REGISTRY).sort();
    const generated = Object.keys(ICON_DATA).sort();
    expect(generated).toEqual(registered);
  });

  it("resolves an alias id to its parent's artwork (R11)", () => {
    // `check-circle-2` is stored in Iconify's data as an alias of `circle-check` in the pinned release.
    expect(lucideSet.aliases["check-circle-2"]?.parent).toBe("circle-check");
    const viaAlias = buildIconData({
      a: { tier: "status", provider: "lucide", id: "check-circle-2" },
    });
    const viaParent = buildIconData({
      a: { tier: "status", provider: "lucide", id: "circle-check" },
    });
    expect(viaAlias.a.body).toBe(viaParent.a.body);
    expect(viaAlias.a.body.length).toBeGreaterThan(0);
  });

  describe("Phosphor duotone (R14)", () => {
    const data = buildIconData({
      truck: { tier: "decorative", provider: "ph", id: "truck-duotone" },
      plain: { tier: "decorative", provider: "ph", id: "truck" },
    });

    it("puts fill on the root, not on a wrapper", () => {
      expect(data.truck.root).toEqual({ fill: "currentColor" });
      expect(data.truck.body).not.toContain('fill="currentColor"');
    });

    it("rewrites the secondary layer to read its colour and opacity from variables", () => {
      expect(data.truck.body).not.toContain('opacity=".2"');
      expect(data.truck.body).toContain("var(--icon-secondary,currentColor)");
      expect(data.truck.body).toContain("var(--icon-secondary-opacity,.2)");
    });

    it("leaves a non-duotone Phosphor icon untouched", () => {
      expect(data.plain.body).not.toContain("--icon-secondary");
    });
  });
});
