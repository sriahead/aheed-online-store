"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import { saveCategory } from "@/features/admin/catalogue";
import { initialCatalogueState } from "@/lib/catalogue-form";
import type { AdminCategoryDetail, AdminCategoryRow } from "@/lib/repositories/categories";
import { errorInputClass, inputClass, labelClass } from "@/lib/form-classes";

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
}

export function CategoryForm({ category, categories }: CategoryFormProps) {
  const [state, action, saving] = useActionState(saveCategory, initialCatalogueState);
  const isNew = category === null;

  const parentOptions = categories.filter(
    (row) => row.parentId === null && row.id !== category?.id,
  );

  /**
   * #650 — the className AND the ARIA pair, from one call, so a field cannot be
   * styled as invalid without also being announced as invalid. `errorInputClass`
   * is a border and a background tint: on its own it tells a sighted mouse user
   * which field is wrong and a screen-reader user nothing at all (WCAG SC 1.4.1
   * Use of Colour, SC 3.3.1 Error Identification). Returning both together is why
   * this is `fieldProps` rather than the old `fieldClass` — a future field added
   * to this form gets the association by construction instead of by remembering.
   */
  const fieldProps = (name: string) => {
    const invalid = state.field === name;
    return {
      className: `${inputClass} ${invalid ? errorInputClass : ""}`,
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? "category-form-error" : undefined,
    };
  };

  return (
    <form action={action} className="space-y-6">
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
        <div>
          <label className={labelClass} htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={category?.name ?? ""}
            {...fieldProps("name")}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="slug">
            Web address {isNew && "(leave blank to build it from the name)"}
          </label>
          <input
            id="slug"
            name="slug"
            autoComplete="off"
            spellCheck={false}
            placeholder="rice-grains"
            defaultValue={category?.slug ?? ""}
            {...fieldProps("slug")}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="parentId">
            Parent category — blank makes this a top-level department
          </label>
          <select
            id="parentId"
            name="parentId"
            defaultValue={category?.parentId ?? ""}
            {...fieldProps("parentId")}
          >
            <option value="">None (top level)</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {!option.isActive && " (inactive)"}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-primary-muted">
            Categories go two levels deep, so a sub-category can&apos;t have children of its own.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="sortOrder">
            Sort order — lower numbers appear first
          </label>
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            required
            defaultValue={category?.sortOrder ?? 0}
            {...fieldProps("sortOrder")}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-primary">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={category?.isActive ?? true}
            className="h-4 w-4 rounded border-black/20"
          />
          Visible in the shop
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden />
          {saving ? "Saving…" : isNew ? "Create category" : "Save changes"}
        </button>
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
