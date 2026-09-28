"use client";

import { useActionState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { createBrand, deleteBrand, renameBrand, setBrandImage } from "@/features/admin/brands";
import { initialCatalogueState } from "@/lib/catalogue-form";
import { confirmDeleteLabel } from "@/lib/attribute-form";
import type { AdminBrandRow } from "@/lib/repositories/brands";
import { inputClass, labelClass } from "@/lib/form-classes";
import { Button } from "@/components/ui/Button";

/**
 * Brand admin forms (P2.6 slice 6, #569).
 *
 * Client components ONLY because `useActionState` is what surfaces a server action's error text
 * beside the field that caused it — the forms themselves are real `<form action={...}>` elements
 * and submit without JavaScript. Same pattern as `SynonymDictionary.tsx`.
 *
 * `initialCatalogueState` is imported from `lib/catalogue-form.ts`, NOT from the `"use server"`
 * actions module beside it. A `"use server"` file may export only async functions, and a value
 * export there makes every action in it 500 at runtime while every build and test stays green
 * (#159).
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 *
 * DELETE (#917) NEEDS A TICK WHEN IN USE, NOT A DIALOG — the same rule as `AttributeManager.tsx`:
 * the consequence is stated in the form, and the server refuses without the tick too. No browser
 * confirmation dialog, which a no-JavaScript submit and the curl-driven checks could not see.
 */

const DELETE_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-danger px-4 py-2 " +
  "text-sm font-semibold text-danger transition hover:bg-danger-tint disabled:cursor-not-allowed " +
  "disabled:opacity-60";

function Feedback({ state }: { state: typeof initialCatalogueState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return <p className="mt-2 text-sm text-primary-muted">Saved.</p>;
  }
  return null;
}

export function AddBrandForm() {
  const [state, action, pending] = useActionState(createBrand, initialCatalogueState);

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className={labelClass} htmlFor="new-brand-name">
          Brand name
        </label>
        <input
          id="new-brand-name"
          name="name"
          placeholder="Brand name"
          className={inputClass}
          required
        />
      </div>
      <Button disabled={pending}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {pending ? "Adding…" : "Add brand"}
      </Button>
      <div className="sm:sr-only">
        <Feedback state={state} />
      </div>
    </form>
  );
}

/**
 * One brand's rename and image-key forms.
 *
 * TWO SEPARATE `<form>` elements, not one with two buttons: they are different writes with
 * different failure modes (a rename can collide with an existing brand; an image key cannot), and
 * a single form would make one action's field error appear to belong to the other's input.
 *
 * The slug is shown read-only and is deliberately NOT editable: it is what a shopper's bookmarked
 * `/search?brand=<slug>` URL carries, so a rename keeps it and existing links keep working.
 */
export function BrandRowForms({ brand }: { brand: AdminBrandRow }) {
  const [renameState, renameAction, renaming] = useActionState(renameBrand, initialCatalogueState);
  const [imageState, imageAction, savingImage] = useActionState(
    setBrandImage,
    initialCatalogueState,
  );
  const [deleteState, deleteAction, deleting] = useActionState(deleteBrand, initialCatalogueState);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-primary">{brand.name}</p>
        <p className="text-xs text-primary-muted">
          <code>{brand.slug}</code> · {brand.productCount}{" "}
          {brand.productCount === 1 ? "product" : "products"}
        </p>
      </div>

      <form action={renameAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="brandId" value={brand.id} />
        <div className="flex-1">
          <label className={labelClass} htmlFor={`rename-${brand.id}`}>
            Rename
          </label>
          <input
            id={`rename-${brand.id}`}
            name="name"
            defaultValue={brand.name}
            className={inputClass}
            required
          />
        </div>
        <Button disabled={renaming}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {renaming ? "Saving…" : "Rename"}
        </Button>
      </form>
      <Feedback state={renameState} />

      <form action={imageAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="brandId" value={brand.id} />
        <div className="flex-1">
          <label className={labelClass} htmlFor={`image-${brand.id}`}>
            Image key (optional)
          </label>
          <input
            id={`image-${brand.id}`}
            name="imageKey"
            placeholder="brands/brand-name/logo.webp"
            defaultValue={brand.imageKey ?? ""}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-primary-muted">
            A relative storage key, never a URL. Nothing displays it yet — it is here so brand
            thumbnails have somewhere to live. Leave blank to clear.
          </p>
        </div>
        <Button disabled={savingImage}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {savingImage ? "Saving…" : "Save key"}
        </Button>
      </form>
      <Feedback state={imageState} />

      <form action={deleteAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="brandId" value={brand.id} />
        {brand.productCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-primary">
            <input type="checkbox" name="confirmDelete" required />
            {confirmDeleteLabel(brand.productCount)}
          </label>
        )}
        <button type="submit" disabled={deleting} className={DELETE_BUTTON_CLASS}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {deleting ? "Deleting…" : "Delete brand"}
        </button>
      </form>
      <Feedback state={deleteState} />
    </div>
  );
}
