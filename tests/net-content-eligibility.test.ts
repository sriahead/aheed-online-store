import { describe, expect, it } from "vitest";
import { buildEligibleProductWhere, choosePhotoEvidence } from "@/lib/net-content-eligibility";
import { nextConfirmedPhotoSource, type ProductImageSource } from "@/lib/product-image";

/**
 * #900 — which products the suggester may attempt (R14), which photo it may read (R14), and the
 * only provenance transitions staff may make (R8). All pure.
 */

describe("buildEligibleProductWhere (R14)", () => {
  it("excludes inactive products, products with net content, and products with a PENDING row", () => {
    expect(buildEligibleProductWhere("v1", { includeAttempted: true })).toEqual({
      vendorId: "v1",
      isActive: true,
      netContentAmount: null,
      netContentSuggestions: { none: { status: "PENDING" } },
    });
  });

  it("by default excludes any product attempted before, including one with only a REJECTED row", () => {
    expect(
      buildEligibleProductWhere("v1", { includeAttempted: false }).netContentSuggestions,
    ).toEqual({
      none: {},
    });
  });

  it("narrows to one product when asked, keeping every other rule", () => {
    const where = buildEligibleProductWhere("v1", { includeAttempted: false, productId: "p9" });
    expect(where).toMatchObject({
      id: "p9",
      vendorId: "v1",
      isActive: true,
      netContentAmount: null,
    });
  });
});

describe("choosePhotoEvidence (R14)", () => {
  const image = (id: string, sortOrder: number, source: ProductImageSource) => ({
    id,
    storageKey: `k/${id}`,
    sortOrder,
    source,
  });

  it("chooses the lowest-sortOrder staff-sourced image", () => {
    const chosen = choosePhotoEvidence([
      image("a", 0, "AI_GENERATED"),
      image("b", 3, "STAFF_UPLOAD"),
      image("c", 2, "STAFF_CONFIRMED_PHOTO"),
    ]);
    expect(chosen?.id).toBe("c");
  });

  it("returns none when only non-evidence sources exist", () => {
    expect(
      choosePhotoEvidence([
        image("a", 0, "UNKNOWN"),
        image("b", 1, "AI_GENERATED"),
        image("c", 2, "OPEN_FOOD_FACTS"),
        image("d", 3, "PLACEHOLDER"),
      ]),
    ).toBeNull();
    expect(choosePhotoEvidence([])).toBeNull();
  });
});

describe("nextConfirmedPhotoSource (R8)", () => {
  it("toggles only between UNKNOWN and STAFF_CONFIRMED_PHOTO", () => {
    expect(nextConfirmedPhotoSource("UNKNOWN")).toBe("STAFF_CONFIRMED_PHOTO");
    expect(nextConfirmedPhotoSource("STAFF_CONFIRMED_PHOTO")).toBe("UNKNOWN");
  });

  it.each(["AI_GENERATED", "OPEN_FOOD_FACTS", "PLACEHOLDER", "STAFF_UPLOAD"] as const)(
    "refuses %s",
    (source) => {
      expect(nextConfirmedPhotoSource(source)).toBeNull();
    },
  );
});
