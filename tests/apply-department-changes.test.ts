import { describe, expect, it } from "vitest";
import {
  DEPARTMENTS_TO_HIDE,
  OWNER_SEARCH_PLACEHOLDER,
  planDepartmentChanges,
  type CategoryState,
  type VendorDepartmentState,
} from "../prisma/department-changes";

/**
 * #1131 R10 — the decisions behind `scripts/apply-department-changes.ts`. The script only reads a
 * vendor, prints this plan and (with `--apply`) writes it, so these fixtures are the whole of its
 * behaviour short of the database round-trip, which validation runs live.
 */

function dept(slug: string, isActive = true, parentId: string | null = null): CategoryState {
  return { id: `id-${slug}`, slug, name: slug, parentId, isActive };
}

const FIVE_ACTIVE = DEPARTMENTS_TO_HIDE.map((slug) => dept(slug));
const OTHER = [dept("fruit-veg"), dept("fresh-fruit", true, "id-fruit-veg")];

function state(categories: CategoryState[], placeholder: string | null = "Search products…") {
  return {
    categories,
    searchPlaceholder: placeholder,
    hasConfig: true,
  } satisfies VendorDepartmentState;
}

describe("planDepartmentChanges", () => {
  it("nothing done yet: hides exactly the five, creates the Fish tree, sets the placeholder", () => {
    const plan = planDepartmentChanges(state([...FIVE_ACTIVE, ...OTHER]), "apply");
    expect(plan.changes).toEqual([
      ...DEPARTMENTS_TO_HIDE.map((slug) => ({ kind: "hide", id: `id-${slug}`, slug, name: slug })),
      { kind: "create-department", slug: "fish", name: "Fish" },
      { kind: "create-subcategory", slug: "fresh-fish", name: "Fresh Fish", parentSlug: "fish" },
      { kind: "create-subcategory", slug: "frozen-fish", name: "Frozen Fish", parentSlug: "fish" },
      { kind: "set-search-placeholder", from: "Search products…", to: OWNER_SEARCH_PLACEHOLDER },
    ]);
    expect(plan.notes).toEqual([]);
  });

  it("already applied: plans nothing, so a second --apply writes nothing", () => {
    const applied = state(
      [
        ...DEPARTMENTS_TO_HIDE.map((slug) => dept(slug, false)),
        ...OTHER,
        dept("fish"),
        dept("fresh-fish", true, "id-fish"),
        dept("frozen-fish", true, "id-fish"),
      ],
      OWNER_SEARCH_PLACEHOLDER,
    );
    expect(planDepartmentChanges(applied, "apply")).toEqual({ changes: [], notes: [] });
  });

  it("Fish partly present: creates only the missing sub-category", () => {
    const partial = state(
      [
        ...FIVE_ACTIVE.map((c) => ({ ...c, isActive: false })),
        dept("fish"),
        dept("fresh-fish", true, "id-fish"),
      ],
      OWNER_SEARCH_PLACEHOLDER,
    );
    expect(planDepartmentChanges(partial, "apply").changes).toEqual([
      { kind: "create-subcategory", slug: "frozen-fish", name: "Frozen Fish", parentSlug: "fish" },
    ]);
  });

  it("a vendor without some of the five: skips them and says so", () => {
    const some = state([dept("household"), dept("pet-supplies"), ...OTHER]);
    const plan = planDepartmentChanges(some, "apply");
    expect(
      plan.changes.filter((c) => c.kind === "hide").map((c) => ("slug" in c ? c.slug : "")),
    ).toEqual(["household", "pet-supplies"]);
    expect(plan.notes).toEqual([
      "skipped international: this vendor has no category with that slug",
      "skipped health-beauty: this vendor has no category with that slug",
      "skipped baby-kids: this vendor has no category with that slug",
    ]);
  });

  it("restore: shows exactly the five again and changes nothing else", () => {
    const hidden = state(
      [...DEPARTMENTS_TO_HIDE.map((slug) => dept(slug, false)), dept("fish"), dept("zz", false)],
      OWNER_SEARCH_PLACEHOLDER,
    );
    const plan = planDepartmentChanges(hidden, "restore");
    expect(plan.changes).toEqual(
      DEPARTMENTS_TO_HIDE.map((slug) => ({ kind: "show", id: `id-${slug}`, slug, name: slug })),
    );
    // A restore never touches Fish, the placeholder, or a category outside the five ("zz").
    expect(plan.changes.every((c) => c.kind === "show")).toBe(true);
    // And a restore of an already-restored vendor is empty.
    expect(planDepartmentChanges(state(FIVE_ACTIVE), "restore").changes).toEqual([]);
  });

  it("never treats a same-slug SUB-category as one of the five departments", () => {
    const plan = planDepartmentChanges(state([dept("household", true, "id-fruit-veg")]), "apply");
    expect(plan.changes.some((c) => c.kind === "hide")).toBe(false);
    expect(plan.notes).toContain("skipped household: it is a sub-category here, not a department");
  });

  it("skips the placeholder for a vendor with no VendorConfig row", () => {
    const plan = planDepartmentChanges(
      { categories: FIVE_ACTIVE, searchPlaceholder: undefined, hasConfig: false },
      "apply",
    );
    expect(plan.changes.some((c) => c.kind === "set-search-placeholder")).toBe(false);
    expect(plan.notes).toContain(
      "skipped the search placeholder: this vendor has no VendorConfig row",
    );
  });

  it("the owner's placeholder is within the staff form's 80-character limit", () => {
    expect(OWNER_SEARCH_PLACEHOLDER).toBe("Find your favourites...");
    expect(OWNER_SEARCH_PLACEHOLDER.length).toBeLessThanOrEqual(80);
  });
});
