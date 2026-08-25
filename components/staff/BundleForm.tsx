"use client";

import { useActionState, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { saveBundle } from "@/features/admin/bundles";
import { initialBundleFormState } from "@/lib/bundle-form";
import { BundleImageUploader } from "@/components/staff/BundleImageUploader";
import type { BundleWithItems } from "@/lib/repositories/bundles";

/**
 * Curated bundle edit form (P8.5c, #347) — modelled on `CampaignForm.tsx`'s
 * `useActionState` wiring.
 *
 * One form for both create and edit: `bundle` is null on the "new" route, and
 * `saveBundle` creates or updates on the hidden `bundleId` either way.
 *
 * The constituent rows are the one piece of local state here. They submit as
 * REPEATED `productId`/`quantity` fields read POSITIONALLY by
 * `parseBundleItems` — every row emits both inputs or neither, so the two
 * arrays stay aligned. That is the same contract P3d's review step relies on,
 * and the reason the parser treats a blank `productId` as a skipped row rather
 * than an error.
 */

const inputClass =
  "w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-primary/70";
const errorInputClass = "border-danger bg-danger-tint";

interface ProductOption {
  id: string;
  name: string;
}

interface ItemRow {
  key: string;
  productId: string;
  quantity: string;
}

function initialRows(bundle: BundleWithItems | null): ItemRow[] {
  if (!bundle || bundle.items.length === 0) {
    return [{ key: "row-0", productId: "", quantity: "1" }];
  }
  return bundle.items.map((item, index) => ({
    key: `row-${index}`,
    productId: item.productId,
    quantity: String(item.quantity),
  }));
}

export function BundleForm({
  bundle,
  products,
  imageUrl,
}: {
  bundle: BundleWithItems | null;
  products: ProductOption[];
  imageUrl: string | null;
}) {
  const [state, action, saving] = useActionState(saveBundle, initialBundleFormState);
  const [rows, setRows] = useState<ItemRow[]>(() => initialRows(bundle));
  const [nextKey, setNextKey] = useState(rows.length);

  const fieldClass = (name: string) =>
    `${inputClass} ${state.field === name ? errorInputClass : ""}`;

  function addRow() {
    setRows((current) => [...current, { key: `row-${nextKey}`, productId: "", quantity: "1" }]);
    setNextKey((key) => key + 1);
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function updateRow(key: string, patch: Partial<ItemRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-6">
        {bundle && <input type="hidden" name="bundleId" value={bundle.id} />}

        {state.error && (
          <p
            role="alert"
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
            Bundle saved.
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
              defaultValue={bundle?.name ?? ""}
              className={fieldClass("name")}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="slug">
              Web address
            </label>
            <input
              id="slug"
              name="slug"
              defaultValue={bundle?.slug ?? ""}
              placeholder="weekly-meat-box"
              className={fieldClass("slug")}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="tagline">
              Tagline <span className="text-primary/40">(optional)</span>
            </label>
            <input
              id="tagline"
              name="tagline"
              defaultValue={bundle?.tagline ?? ""}
              className={fieldClass("tagline")}
            />
          </div>

          <div className="flex items-end gap-4">
            <div className="w-32">
              <label className={labelClass} htmlFor="sortOrder">
                Display order
              </label>
              <input
                id="sortOrder"
                name="sortOrder"
                type="number"
                min={0}
                step={1}
                defaultValue={bundle?.sortOrder ?? 0}
                className={fieldClass("sortOrder")}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-primary">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={bundle?.isActive ?? true}
                className="h-4 w-4"
              />
              Show on the shop page
            </label>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-black/10 bg-white p-5">
          <div>
            <h2 className="text-sm font-bold text-primary">What&apos;s in the bundle</h2>
            <p className="mt-0.5 text-xs text-primary/60">
              The price shoppers see is added up from these products&apos; live prices — there is
              nothing to type. A product that goes out of stock drops off the bundle until it
              returns.
            </p>
          </div>

          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.key} className="flex items-end gap-2">
                <div className="flex-1">
                  <label className={labelClass} htmlFor={`product-${row.key}`}>
                    Product
                  </label>
                  <select
                    id={`product-${row.key}`}
                    name="productId"
                    value={row.productId}
                    onChange={(event) => updateRow(row.key, { productId: event.target.value })}
                    className={inputClass}
                  >
                    <option value="">Choose a product…</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className={labelClass} htmlFor={`quantity-${row.key}`}>
                    Quantity
                  </label>
                  <input
                    id={`quantity-${row.key}`}
                    name="quantity"
                    type="number"
                    min={1}
                    step={1}
                    value={row.quantity}
                    onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="mb-1 rounded-xl border border-black/15 p-2 text-primary/60 hover:border-danger hover:text-danger"
                  aria-label="Remove this product from the bundle"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 rounded-xl border border-primary/20 px-3 py-1.5 text-xs font-bold text-primary"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add a product
          </button>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden />
          {saving ? "Saving…" : "Save bundle"}
        </button>
      </form>

      {/* Upload needs a bundle row to attach to, exactly like the campaign
          banner — so it appears only once the bundle exists. */}
      {bundle && (
        <BundleImageUploader
          bundleId={bundle.id}
          imageUrl={imageUrl}
          existingAltText={bundle.altText}
        />
      )}
    </div>
  );
}
