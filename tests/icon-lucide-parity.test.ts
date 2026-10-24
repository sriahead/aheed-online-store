import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as lucide from "lucide-react";
import { describe, expect, it } from "vitest";
import { ICON_DATA } from "@/components/icons/generated/icon-data";
import { ICON_REGISTRY } from "@/components/icons/registry";
import manifest from "./fixtures/lucide-icons-in-use.json";
import { LUCIDE_PARITY_EXCEPTIONS } from "./fixtures/icon-parity-exceptions";
import { geometryOf, sameGeometry } from "../scripts/lib/svg-geometry";

/**
 * Proves R26 (#1223): for every Lucide icon in the registry, the artwork in the generated data matches
 * what the installed `lucide-react` renders, so Phase 1 and 2 change no pixel.
 *
 * Why this is not a string comparison and what "match" means are written at the top of
 * `scripts/lib/svg-geometry.ts` (Iconify's optimiser merges, re-spells and rounds). Any icon that
 * genuinely differs must be listed in `LUCIDE_PARITY_EXCEPTIONS` with a reason, and a listed exception
 * that has stopped diverging fails the test, so the list cannot become a blanket allowance.
 */

const exceptions = new Map(LUCIDE_PARITY_EXCEPTIONS.map((e) => [e.key, e.reason]));
const exportFor = new Map(manifest.icons.map((i) => [i.key, i.export]));

function lucideGeometry(exportName: string): string[] {
  const component = (lucide as unknown as Record<string, React.ComponentType | undefined>)[
    exportName
  ];
  if (!component) throw new Error(`lucide-react has no export named ${exportName}`);
  return geometryOf(renderToStaticMarkup(createElement(component)));
}

const keys = Object.entries(ICON_REGISTRY)
  .filter(([, entry]) => entry.provider === "lucide")
  .map(([key]) => key);

describe("Lucide parity with lucide-react", () => {
  it("covers every Lucide registry entry with an export name", () => {
    for (const key of keys)
      expect(exportFor.get(key), `no lucide-react export recorded for ${key}`).toBeDefined();
  });

  it.each(keys)("%s matches the installed lucide-react geometry", (key) => {
    const ours = geometryOf(ICON_DATA[key as keyof typeof ICON_DATA].body);
    const theirs = lucideGeometry(exportFor.get(key)!);
    const matches = sameGeometry(ours, theirs);
    if (exceptions.has(key)) {
      expect(
        matches,
        `${key} is listed as an exception (${exceptions.get(key)}) but now matches: remove it`,
      ).toBe(false);
    } else {
      expect(
        matches,
        `${key} differs from lucide-react; fix the pin or list it with a reason`,
      ).toBe(true);
    }
  });

  it("every exception has a reason and names a real registry key", () => {
    for (const e of LUCIDE_PARITY_EXCEPTIONS) {
      expect(e.reason.trim().length).toBeGreaterThan(10);
      expect(keys).toContain(e.key);
    }
  });
});
