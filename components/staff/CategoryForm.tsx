"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveCategory } from "@/features/admin/catalogue";
import { initialCatalogueState } from "@/lib/catalogue-form";
import type {
  AdminCategoryDetail,
  AdminCategoryRow,
  CategoryHiddenCounts,
} from "@/lib/repositories/categories";
import { FormField } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/icons/Icon";
import { CategoryImageManager } from "@/components/staff/CategoryImageManager";

/**
 * Category create/edit form (P6b1, #159).
 *
 * One component for both modes, like ProductForm: `category` is null when
 * creating, and the action decides create-vs-update from the hidden categoryId.
 *
 * THE PARENT PICKER ONLY OFFERS TOP-LEVEL CATEGORIES, and never the category
 * being edited. That mirrors the repository rule rather than replacing it — the
 * server re-checks both, because a select is just a form field and a form field
 * is untrusted. Offering only legal options means the UI cannot invite a
 * refusal it already knows about.
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

export interface CategoryFormProps {
  category: AdminCategoryDetail | null;
  /** Every category for this vendor — filtered to legal parents below. */
  categories: AdminCategoryRow[];
  /**
   * #1131 — edit mode only: what switching this category off hides from shoppers, stated beside
   * the checkbox. Omitted (or null) when creating.
   */
  hiddenCounts?: CategoryHiddenCounts | null;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The advisory beside "Visible in the shop" (#1131), or null when switching off would hide nothing.
 * Exported for its test. Names no vendor and no kind of product (CLAUDE.md, user-facing copy).
 */
export function hiddenWithCategoryNote(counts: CategoryHiddenCounts): string | null {
  const parts = [
    counts.products > 0 && plural(counts.products, "product", "products"),
    counts.subCategories > 0 && plural(counts.subCategories, "sub-category", "sub-categories"),
  ].filter((part): part is string => part !== false);
  if (parts.length === 0) return null;
  return `Turning this off also hides its ${parts.join(" and ")} from shoppers. They come back when you turn it on.`;
}

export function CategoryForm({ category, categories, hiddenCounts = null }: CategoryFormProps) {
  const [state, action, saving] = useActionState(saveCategory, initialCatalogueState);
  const isNew = category === null;

  // #1131 — after a refused save, render what was submitted rather than the stored row. React 19
  // resets uncontrolled fields when the action settles; these defaults are what it resets TO.
  const submitted = state.error ? state.submittedCategory : undefined;
  const values = submitted ?? {
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    parentId: category?.parentId ?? "",
    sortOrder: String(category?.sortOrder ?? 0),
    isActive: category?.isActive ?? true,
    imageKey: category?.imageKey ?? "",
    allowsCustomNote: category?.allowsCustomNote ?? false,
  };
  // A changed key remounts the fields, so a select or checkbox cannot keep a stale DOM default.
  const formKey = submitted ? `refused:${state.error}:${JSON.stringify(submitted)}` : "stored";
  const hiddenNote = !isNew && hiddenCounts ? hiddenWithCategoryNote(hiddenCounts) : null;

  const [imageKey, setImageKey] = useState(values.imageKey);

  const parentOptions = categories.filter(
    (row) => row.parentId === null && row.id !== category?.id,
  );

  // #650/#656 — `FormField` carries the className-and-ARIA pairing that used
  // to be this file's own `fieldProps` closure: a field cannot be styled as
  // invalid without also being announced as invalid (R8). Every field here
  // points at the same shared banner id, matching the pre-existing
  // `fieldProps` convention.
  const isInvalid = (name: string) => state.field === name;

  return (
    <form key={formKey} action={action} className="space-y-6">
      {category && <input type="hidden" name="categoryId" value={category.id} />}

      {state.error && (
        <p
          role="alert"
          id="category-form-error"
          className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
        >
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p
          role="status"
          className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
        >
          Category saved.
        </p>
      )}

      <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
        <FormField
          name="name"
          label="Name"
          required
          defaultValue={values.name}
          error={isInvalid("name")}
          errorId="category-form-error"
        />

        <FormField
          name="slug"
          label={`Web address ${isNew ? "(leave blank to build it from the name)" : ""}`}
          autoComplete="off"
          spellCheck={false}
          placeholder="category-name"
          defaultValue={values.slug}
          error={isInvalid("slug")}
          errorId="category-form-error"
        />

        <FormField
          name="parentId"
          as="select"
          label="Parent category — blank makes this a top-level department"
          defaultValue={values.parentId}
          error={isInvalid("parentId")}
          errorId="category-form-error"
          hint="Categories go two levels deep, so a sub-category can't have children of its own."
        >
          <option value="">None (top level)</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {!option.isActive && " (inactive)"}
            </option>
          ))}
        </FormField>

        <FormField
          name="sortOrder"
          label="Sort order — lower numbers appear first"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          required
          defaultValue={values.sortOrder}
          error={isInvalid("sortOrder")}
          errorId="category-form-error"
        />

        {category && (
          <CategoryImageManager
            categoryId={category.id}
            categoryName={category.name}
            slug={category.slug}
            imageKey={imageKey}
            imageUrl={category.imageUrl ?? null}
            onImageKeyChange={(newKey) => setImageKey(newKey)}
          />
        )}

        <FormField
          name="imageKey"
          label="Photograph storage key (e.g. categories/fruit-veg.jpg)"
          placeholder="categories/slug.jpg"
          value={imageKey}
          onChange={(e) => setImageKey(e.target.value)}
          error={isInvalid("imageKey")}
          errorId="category-form-error"
          hint="Relative storage key for realistic product photography. If blank, defaults to /images/categories/[slug].jpg"
        />

        <label className="flex items-center gap-2 text-sm text-primary">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={values.isActive}
            aria-describedby={hiddenNote ? "category-hidden-note" : undefined}
            className="h-4 w-4 rounded border-black/20"
          />
          Visible in the shop
        </label>
        {hiddenNote && (
          <p id="category-hidden-note" className="text-xs text-primary-muted">
            {hiddenNote}
          </p>
        )}

        {/* #1135 — covers this category's sub-categories too (lib/custom-note.ts). */}
        <label className="flex items-center gap-2 text-sm text-primary">
          <input
            type="checkbox"
            name="allowsCustomNote"
            defaultChecked={values.allowsCustomNote}
            className="h-4 w-4 rounded border-black/20"
          />
          Customers can add a note to items in this category
        </label>
      </section>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={saving}>
          <Icon name="save" className="h-4 w-4" />
          {saving ? "Saving…" : isNew ? "Create category" : "Save changes"}
        </Button>
        <Link
          href="/staff/categories"
          className="text-sm font-semibold text-primary-muted hover:underline"
        >
          Back to categories
        </Link>
      </div>
    </form>
  );
}
