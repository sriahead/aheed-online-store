import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ICON_REGISTRY } from "@/components/icons/registry";
import { ICON_3D_DEFINITIONS } from "@/lib/icons-3d/catalog";
import {
  DEPARTMENT_3D_NAMES,
  FLAT_ICON_SLOTS,
  ICON_3D_SLOTS,
  ICON_SLOTS,
  isIconSlotId,
  slotIdForIcon3D,
  slotIdForIconName,
} from "@/lib/icon-slots";

/** #1288 R8 and R26: one canonical registry of AI-replaceable icon slots. */

const EXPECTED_3D_IDS = [
  "delivery-van",
  "storefront",
  "quick-shop",
  "user-profile",
  "cart-floating",
  "secure-checkout",
  "order-updates",
  "view-shopper",
  "view-staff",
  "view-admin",
  "rewards-coin",
  "halal-certified",
  "postcode-search",
  "contact-follow",
  "rewards-gift",
];

describe("ICON_SLOTS (#1288 R8)", () => {
  it("has exactly the 15 3D slot ids", () => {
    expect(ICON_3D_SLOTS.map((slot) => slot.id).sort()).toEqual([...EXPECTED_3D_IDS].sort());
    expect(ICON_3D_SLOTS.every((slot) => slot.kind === "3d")).toBe(true);
  });

  it("derives one flat slot for every Noto registry icon, and only those", () => {
    const notoNames = Object.entries(ICON_REGISTRY)
      .filter(([, entry]) => entry.provider === "noto")
      .map(([name]) => `icon:${name}`)
      .sort();
    expect(FLAT_ICON_SLOTS.map((slot) => slot.id).sort()).toEqual(notoNames);
    expect(FLAT_ICON_SLOTS.every((slot) => slot.kind === "flat")).toBe(true);
    // Functional icons and the rating star are never slots.
    expect(isIconSlotId("icon:chevron-down")).toBe(false);
    expect(isIconSlotId("icon:star")).toBe(false);
  });

  it("has no duplicate id", () => {
    const ids = ICON_SLOTS.map((slot) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(ICON_3D_SLOTS.length + FLAT_ICON_SLOTS.length);
  });

  it("gives every 3D slot a label, surfaces and a real Icon3D name", () => {
    for (const slot of ICON_3D_SLOTS) {
      expect(slot.label.length, slot.id).toBeGreaterThan(0);
      expect(slot.surfaces.length, slot.id).toBeGreaterThan(0);
      expect(Object.keys(ICON_3D_DEFINITIONS), slot.id).toContain(slot.icon3d);
    }
  });

  it("maps cart-floating to the cart-add 3D icon", () => {
    expect(ICON_3D_SLOTS.find((slot) => slot.id === "cart-floating")?.icon3d).toBe("cart-add");
    expect(slotIdForIcon3D("cart-add")).toBe("cart-floating");
  });

  it("covers all 23 Icon3D names as 15 slots plus the 8 category-managed departments", () => {
    const covered = new Set([...ICON_3D_SLOTS.map((slot) => slot.icon3d), ...DEPARTMENT_3D_NAMES]);
    expect([...covered].sort()).toEqual(Object.keys(ICON_3D_DEFINITIONS).sort());
    expect(covered.size).toBe(23);
  });

  it("resolves an <Icon> name to its flat slot, and a functional one to nothing", () => {
    expect(slotIdForIconName("package")).toBe("icon:package");
    expect(slotIdForIconName("chevron-down")).toBeUndefined();
  });

  it("is a plain module: no directive and no React import", () => {
    const source = readFileSync("lib/icon-slots.ts", "utf8");
    expect(source).not.toMatch(/^\s*["']use (client|server)["']/m);
    expect(source).not.toMatch(/from "react"/);
  });
});

describe("Replaceable icon inventory doc (#1288 R26)", () => {
  const doc = readFileSync("docs/client-help-centre/icon-and-visual-asset-standards.md", "utf8");
  const start = doc.indexOf("## Replaceable icon inventory");
  const next = doc.indexOf("\n## ", start + 1);
  const section = doc.slice(start, next === -1 ? undefined : next);
  const firstCells = section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|")[1]?.trim().replace(/`/g, ""));

  it("has the section", () => {
    expect(start).toBeGreaterThan(-1);
  });

  it("lists every slot id exactly once", () => {
    for (const slot of ICON_SLOTS) {
      expect(firstCells.filter((cell) => cell === slot.id).length, slot.id).toBe(1);
    }
  });

  it("lists every department name exactly once", () => {
    for (const name of DEPARTMENT_3D_NAMES) {
      expect(firstCells.filter((cell) => cell === name).length, name).toBe(1);
    }
  });
});
