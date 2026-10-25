import { describe, expect, it } from "vitest";
import { ICON_REGISTRY } from "@/components/icons/registry";
import manifest from "./fixtures/lucide-icons-in-use.json";

/**
 * Proves R31 (#1223): every `lucide-react` icon the app imported at BASE resolves to a registry entry,
 * so a file can be migrated mechanically without a missing-icon surprise.
 *
 * The fixture records, for each `lucide-react` export name used at BASE, the registry key chosen for it.
 * Several exports can share a key (`CheckCircle2` and `CircleCheck` are one icon). The names themselves are
 * re-derivable at BASE with `npx tsx scripts/list-lucide-imports.ts --root <BASE checkout>`.
 */

describe("lucide icons in use at BASE", () => {
  it("records 102 distinct exports (the count at BASE, not the 141 first estimated)", () => {
    expect(manifest.count).toBe(manifest.icons.length);
    expect(new Set(manifest.icons.map((i) => i.export)).size).toBe(manifest.icons.length);
    expect(manifest.icons.length).toBe(102);
  });

  it.each(manifest.icons)("$export resolves to registry key $key", ({ key }) => {
    expect(ICON_REGISTRY).toHaveProperty([key]);
    const entry = ICON_REGISTRY[key as keyof typeof ICON_REGISTRY];
    if (entry.tier === "functional" || key === "star") {
      expect(entry.provider).toBe("lucide");
    } else {
      expect(entry.provider).toBe("noto");
    }
  });

  it("the registry holds no icon the manifest does not account for, bar Phase 3, #1239 and #1242 additions", () => {
    const accountedFor = new Set(manifest.icons.map((i) => i.key));
    const allowedAdditions = new Set([
      "featured-star",
      "heart-outline",
      "rewards-bag",
      "rewards-coins",
      "rewards-discount",
      "rewards-gift",
      "rewards-invite",
      "rewards-sparkles",
      "shopping-cart",
      "trust-delivery",
      "trust-payment",
      "trust-updates",
      "upload",
    ]);
    for (const [key] of Object.entries(ICON_REGISTRY)) {
      if (allowedAdditions.has(key)) continue;
      expect(accountedFor.has(key), `${key} is unused`).toBe(true);
    }
  });
});
