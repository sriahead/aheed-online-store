import { describe, expect, it } from "vitest";
import { ICON_REGISTRY } from "@/components/icons/registry";

/**
 * Proves R15 and R16 (#1223): the registry's keys are generic nouns with no provider leaking in, every
 * entry has a valid shape, and the functional tier is Lucide only.
 *
 * R16's COMPILE-TIME half lives in `components/icons/registry.ts` (`satisfies Record<string,
 * RegistryEntry>` over a discriminated union) and is proved by the `@ts-expect-error` line below: if the
 * type ever stopped rejecting a functional Phosphor entry, that line would become an unused directive
 * and `npm run typecheck` would fail.
 */

const KEY_SHAPE = /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/;
const FORBIDDEN_IN_KEY = ["lucide", "phosphor", "noto", "duotone"];
const entries = Object.entries(ICON_REGISTRY);

describe("icon registry", () => {
  it("has entries", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)("%s has a valid shape", (_key, entry) => {
    expect(["functional", "status", "decorative"]).toContain(entry.tier);
    expect(["lucide", "ph", "noto"]).toContain(entry.provider);
    expect(entry.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(entries)("key %s is a generic noun: no numeric suffix, no provider name", (key) => {
    expect(key).toMatch(KEY_SHAPE);
    for (const word of FORBIDDEN_IN_KEY) expect(key).not.toContain(word);
  });

  it("every functional entry comes from Lucide", () => {
    const functional = entries.filter(([, e]) => e.tier === "functional");
    expect(functional.length).toBeGreaterThan(0);
    for (const [key, entry] of functional) {
      expect(entry.provider, `${key} is functional but not Lucide`).toBe("lucide");
    }
  });

  it("the type rejects a functional entry from Phosphor or Noto", () => {
    // @ts-expect-error a functional entry must have provider "lucide", not "ph"
    const badPh: import("@/components/icons/types").RegistryEntry = {
      tier: "functional",
      provider: "ph",
      id: "x",
    };
    expect(badPh.tier).toBe("functional");

    // @ts-expect-error a functional entry must have provider "lucide", not "noto"
    const badNoto: import("@/components/icons/types").RegistryEntry = {
      tier: "functional",
      provider: "noto",
      id: "x",
    };
    expect(badNoto.tier).toBe("functional");
  });
});
