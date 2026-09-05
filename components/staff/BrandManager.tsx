"use client";

import { useActionState } from "react";
import { Plus, Save } from "lucide-react";
import { createBrand, renameBrand, setBrandImage } from "@/features/admin/brands";
import { initialCatalogueState } from "@/lib/catalogue-form";
import type { AdminBrandRow } from "@/lib/repositories/brands";

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
 */

const inputClass =
  "w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-primary/70";
const buttonClass =
  "inline-flex items-center gap-2 rounded-full bg-action px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-hover disabled:opacity-60";

function Feedback({ state }: { state: typeof initialCatalogueState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return <p className="mt-2 text-sm text-primary/70">Saved.</p>;
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
        <input id="new-brand-name" name="name" placeholder="Shan" className={inputClass} required />
      </div>
      <button type="submit" className={buttonClass} disabled={pending}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {pending ? "Adding…" : "Add brand"}
      </button>
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-primary">{brand.name}</p>
        <p className="text-xs text-primary/60">
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
        <button type="submit" className={buttonClass} disabled={renaming}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {renaming ? "Saving…" : "Rename"}
        </button>
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
            placeholder="brands/shan/logo.webp"
            defaultValue={brand.imageKey ?? ""}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-primary/60">
            A relative storage key, never a URL. Nothing displays it yet — it is here so brand
            thumbnails have somewhere to live. Leave blank to clear.
          </p>
        </div>
        <button type="submit" className={buttonClass} disabled={savingImage}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {savingImage ? "Saving…" : "Save key"}
        </button>
      </form>
      <Feedback state={imageState} />
    </div>
  );
}
