"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import { saveCategory } from "@/features/admin/catalogue";
import { initialCatalogueState } from "@/lib/catalogue-form";
import type { AdminCategoryDetail, AdminCategoryRow } from "@/lib/repositories/categories";
import { FormField } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";

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

  // #650/#656 — `FormField` carries the className-and-ARIA pairing that used
  // to be this file's own `fieldProps` closure: a field cannot be styled as
  // invalid without also being announced as invalid (R8). Every field here
  // points at the same shared banner id, matching the pre-existing
  // `fieldProps` convention.
  const isInvalid = (name: string) => state.field === name;

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
        <FormField
          name="name"
          label="Name"
          required
          defaultValue={category?.name ?? ""}
          error={isInvalid("name")}
          errorId="category-form-error"
        />

        <FormField
          name="slug"
          label={`Web address ${isNew ? "(leave blank to build it from the name)" : ""}`}
          autoComplete="off"
          spellCheck={false}
          placeholder="rice-grains"
          defaultValue={category?.slug ?? ""}
          error={isInvalid("slug")}
          errorId="category-form-error"
        />

        <FormField
          name="parentId"
          as="select"
          label="Parent category — blank makes this a top-level department"
          defaultValue={category?.parentId ?? ""}
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
          defaultValue={category?.sortOrder ?? 0}
          error={isInvalid("sortOrder")}
          errorId="category-form-error"
        />

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
        <Button variant="primary" disabled={saving}>
          <Save className="h-4 w-4" aria-hidden />
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
