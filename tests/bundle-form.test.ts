import { describe, expect, it } from "vitest";
import { parseBundleForm, parseBundleItems } from "@/lib/bundle-form";
import { buildBundleImageKey, isBundleImageKey } from "@/lib/bundle-image";

/** P8.5c (#347) — R28/R29/R30, exercised without a database or a session. */

const valid = { name: "Weekly Meat Box", slug: "weekly-meat-box", sortOrder: "0" };

describe("parseBundleForm", () => {
  it("accepts a well-formed bundle", () => {
    const result = parseBundleForm({ ...valid, tagline: "Three cuts", isActive: "on" });
    expect(result).toEqual({
      ok: true,
      value: {
        slug: "weekly-meat-box",
        name: "Weekly Meat Box",
        tagline: "Three cuts",
        isActive: true,
        sortOrder: 0,
      },
    });
  });

  it("treats a blank tagline as null rather than an empty string", () => {
    const result = parseBundleForm({ ...valid, tagline: "   " });
    expect(result.ok && result.value.tagline).toBeNull();
  });

  it("treats an absent isActive checkbox as false", () => {
    const result = parseBundleForm(valid);
    expect(result.ok && result.value.isActive).toBe(false);
  });

  it("requires a name", () => {
    const result = parseBundleForm({ ...valid, name: "  " });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.field).toBe("name");
  });

  it("requires a slug", () => {
    const result = parseBundleForm({ ...valid, slug: "" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.field).toBe("slug");
  });

  it.each(["Weekly Box", "weekly_box", "-leading", "trailing-", "double--hyphen", "UPPER"])(
    "rejects the malformed slug %j",
    (slug) => {
      const result = parseBundleForm({ ...valid, slug });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.field).toBe("slug");
    },
  );

  it("defaults a blank display order to 0", () => {
    const result = parseBundleForm({ ...valid, sortOrder: "" });
    expect(result.ok && result.value.sortOrder).toBe(0);
  });

  it.each(["-1", "1.5", "abc"])("rejects the display order %j", (sortOrder) => {
    const result = parseBundleForm({ ...valid, sortOrder });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.field).toBe("sortOrder");
  });
});

describe("parseBundleItems", () => {
  it("pairs the two repeated fields positionally", () => {
    const result = parseBundleItems(["a", "b"], ["2", "1"]);
    expect(result).toEqual({
      ok: true,
      value: [
        { productId: "a", quantity: 2 },
        { productId: "b", quantity: 1 },
      ],
    });
  });

  it("drops an empty row silently — a row the admin never filled in", () => {
    const result = parseBundleItems(["a", "", "b"], ["1", "1", "3"]);
    expect(result.ok && result.value).toEqual([
      { productId: "a", quantity: 1 },
      { productId: "b", quantity: 3 },
    ]);
  });

  it("returns an empty list when every row is blank", () => {
    expect(parseBundleItems(["", ""], ["1", "1"])).toEqual({ ok: true, value: [] });
  });

  it.each(["0", "-2", "1.5", "", "abc"])(
    "rejects a real product with the unusable quantity %j",
    (quantity) => {
      const result = parseBundleItems(["a"], [quantity]);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.field).toBe("items");
    },
  );

  it("rejects the same product listed twice", () => {
    const result = parseBundleItems(["a", "a"], ["1", "2"]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/already in this bundle/i);
  });
});

describe("bundle image keys (R30)", () => {
  const bundleId = "11111111-2222-4333-8444-555555555555";

  it("round-trips a key it built for the same bundle", () => {
    const key = buildBundleImageKey(bundleId);
    expect(isBundleImageKey(key, bundleId)).toBe(true);
    expect(key.startsWith(`bundles/${bundleId}/`)).toBe(true);
    expect(key.endsWith(".webp")).toBe(true);
  });

  it("builds a NEW key each time — keys are immutable, never overwritten", () => {
    expect(buildBundleImageKey(bundleId)).not.toBe(buildBundleImageKey(bundleId));
  });

  it("refuses a key belonging to a different bundle", () => {
    const key = buildBundleImageKey(bundleId);
    expect(isBundleImageKey(key, "99999999-2222-4333-8444-555555555555")).toBe(false);
  });

  it("refuses a key with no .webp suffix", () => {
    const key = buildBundleImageKey(bundleId).replace(/\.webp$/, "");
    expect(isBundleImageKey(key, bundleId)).toBe(false);
  });

  it("refuses a key with an extra path segment", () => {
    const key = buildBundleImageKey(bundleId).replace("bundles/", "bundles/nested/");
    expect(isBundleImageKey(key, bundleId)).toBe(false);
  });

  it("refuses a key under a different prefix", () => {
    const key = buildBundleImageKey(bundleId).replace("bundles/", "categories/");
    expect(isBundleImageKey(key, bundleId)).toBe(false);
  });

  it("refuses a filename that is not a uuid", () => {
    expect(isBundleImageKey(`bundles/${bundleId}/banner.webp`, bundleId)).toBe(false);
  });
});
