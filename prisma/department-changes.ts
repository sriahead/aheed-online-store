/**
 * #1131 — the owner's department changes for Aheed (2026-10-17 website brief), and the ONE decision
 * function that turns a vendor's current categories into the writes needed to apply or undo them.
 *
 * Imported by `prisma/seed.ts` (the Fish department, for a clean dev database) and by
 * `scripts/apply-department-changes.ts` (staging and production). Pure: no Prisma client, no I/O, so
 * `tests/apply-department-changes.test.ts` covers every decision without a database.
 *
 * WHAT "HIDE" MEANS HERE. Only `Category.isActive` on the five departments changes. Their
 * sub-categories, products and promotions are not touched: `lib/category-visibility.ts` makes a
 * hidden department hide its whole subtree, and switching it back on (`--restore`, or the staff
 * "Visible in the shop" checkbox) brings everything back exactly as it was.
 */

/** The five departments the owner asked to hide "temporarily". Slugs, as seeded. */
export const DEPARTMENTS_TO_HIDE = [
  "international",
  "household",
  "health-beauty",
  "baby-kids",
  "pet-supplies",
] as const;

/** The new Fish department. Shaped like a `prisma/seed.ts` catalogue entry; it ships with no products. */
export const FISH_DEPARTMENT = {
  category: { slug: "fish", name: "Fish" },
  children: [
    { slug: "fresh-fish", name: "Fresh Fish" },
    { slug: "frozen-fish", name: "Frozen Fish" },
  ],
  products: [],
};

/**
 * The owner's header search placeholder, verbatim. Within the 80-character limit `/staff/storefront`
 * applies. #1142 — three ASCII full stops, as the owner wrote it, not an ellipsis character.
 */
export const OWNER_SEARCH_PLACEHOLDER = "Find your favourites...";

export interface CategoryState {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

export interface VendorDepartmentState {
  categories: readonly CategoryState[];
  /** `null` when the vendor has no `VendorConfig` row at all — the placeholder is then skipped. */
  searchPlaceholder: string | null | undefined;
  hasConfig: boolean;
}

export type DepartmentChange =
  | { kind: "hide"; id: string; slug: string; name: string }
  | { kind: "show"; id: string; slug: string; name: string }
  | { kind: "create-department"; slug: string; name: string }
  | { kind: "create-subcategory"; slug: string; name: string; parentSlug: string }
  | { kind: "set-search-placeholder"; from: string | null; to: string };

export interface DepartmentPlan {
  changes: DepartmentChange[];
  /** Things the plan deliberately does not do, said out loud so a dry run explains itself. */
  notes: string[];
}

/**
 * Decide the writes. `apply` hides the five, creates whatever of the Fish tree is missing and sets the
 * placeholder; `restore` shows the five again and changes nothing else (Fish and the placeholder stay,
 * because the owner asked only for the hiding to be temporary).
 *
 * Idempotent by construction: every change is conditional on the current state, so a plan computed
 * after its own changes have been applied is empty.
 */
export function planDepartmentChanges(
  state: VendorDepartmentState,
  mode: "apply" | "restore",
): DepartmentPlan {
  const changes: DepartmentChange[] = [];
  const notes: string[] = [];
  const bySlug = new Map(state.categories.map((category) => [category.slug, category]));

  for (const slug of DEPARTMENTS_TO_HIDE) {
    const category = bySlug.get(slug);
    if (!category) {
      notes.push(`skipped ${slug}: this vendor has no category with that slug`);
      continue;
    }
    if (category.parentId !== null) {
      notes.push(`skipped ${slug}: it is a sub-category here, not a department`);
      continue;
    }
    const target = mode === "apply" ? false : true;
    if (category.isActive !== target) {
      const { id, name } = category;
      changes.push(
        mode === "apply" ? { kind: "hide", id, slug, name } : { kind: "show", id, slug, name },
      );
    }
  }

  if (mode === "restore") return { changes, notes };

  const fish = bySlug.get(FISH_DEPARTMENT.category.slug);
  if (!fish) {
    changes.push({ kind: "create-department", ...FISH_DEPARTMENT.category });
  } else if (fish.parentId !== null) {
    notes.push(`skipped the Fish department: "${fish.slug}" already exists as a sub-category`);
    return { changes, notes: [...notes, ...placeholderPlan(state, changes)] };
  }
  for (const child of FISH_DEPARTMENT.children) {
    const existing = bySlug.get(child.slug);
    if (!existing) {
      changes.push({
        kind: "create-subcategory",
        ...child,
        parentSlug: FISH_DEPARTMENT.category.slug,
      });
    } else if (fish && existing.parentId !== fish.id) {
      notes.push(`skipped ${child.slug}: it already exists under a different parent`);
    }
  }

  return { changes, notes: [...notes, ...placeholderPlan(state, changes)] };
}

/** Appends the placeholder change when needed; returns any note about why it was not. */
function placeholderPlan(state: VendorDepartmentState, changes: DepartmentChange[]): string[] {
  if (!state.hasConfig)
    return ["skipped the search placeholder: this vendor has no VendorConfig row"];
  if (state.searchPlaceholder !== OWNER_SEARCH_PLACEHOLDER) {
    changes.push({
      kind: "set-search-placeholder",
      from: state.searchPlaceholder ?? null,
      to: OWNER_SEARCH_PLACEHOLDER,
    });
  }
  return [];
}

/** One human-readable line per change, for the dry run and the apply log. */
export function describeChange(change: DepartmentChange): string {
  switch (change.kind) {
    case "hide":
      return `hide department ${change.name} (${change.slug})`;
    case "show":
      return `show department ${change.name} (${change.slug})`;
    case "create-department":
      return `create department ${change.name} (${change.slug})`;
    case "create-subcategory":
      return `create sub-category ${change.name} (${change.slug}) under ${change.parentSlug}`;
    case "set-search-placeholder":
      return `set search placeholder from ${JSON.stringify(change.from)} to ${JSON.stringify(change.to)}`;
  }
}
