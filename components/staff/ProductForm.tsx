"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import { saveProduct } from "@/features/admin/catalogue";
import { initialCatalogueState } from "@/lib/catalogue-form";
import type { AdminProductDetail } from "@/lib/repositories/products";
import type { AdminCategoryRow } from "@/lib/repositories/categories";

/**
 * Product create/edit form (P6b1, #159).
 *
 * One component for both modes: `product` is null when creating. The action
 * behind it decides create-vs-update from the hidden productId, so nothing here
 * branches on mode beyond default values and labels.
 *
 * IMAGES ARE READ-ONLY HERE. Upload is #167 (P6b2) — it needs a presigned PUT,
 * bucket CORS and a client-side WebP step, none of which exist yet. Showing the
 * current image without a control to change it is the honest intermediate state.
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

const inputClass =
  "w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-primary/70";
const errorInputClass = "border-danger bg-danger-tint";

/** Pounds, for a form — the DB stores integer pence and formatPrice() adds the symbol. */
function poundsValue(pence: number | null | undefined): string {
  return pence === null || pence === undefined ? "" : (pence / 100).toFixed(2);
}

export interface ProductFormProps {
  product: AdminProductDetail | null;
  categories: AdminCategoryRow[];
  /**
   * Public URLs composed by the PAGE, not here. `composePublicUrl` lives in
   * lib/storage.ts beside the aws4fetch client, so importing it from a
   * "use client" module would drag the signer and lib/config into the browser
   * bundle. The storefront's ProductCard can import it because it is a server
   * component; this one cannot.
   */
  imageUrls: { url: string; alt: string }[];
}

export function ProductForm({ product, categories, imageUrls }: ProductFormProps) {
  const [state, action, saving] = useActionState(saveProduct, initialCatalogueState);
  const isNew = product === null;

  const fieldClass = (name: string) =>
    `${inputClass} ${state.field === name ? errorInputClass : ""}`;

  return (
    <form action={action} className="space-y-6">
      {product && <input type="hidden" name="productId" value={product.id} />}

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
          Product saved.
        </p>
      )}

      <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-bold text-primary">Details</h2>

        <div>
          <label className={labelClass} htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={product?.name ?? ""}
            className={fieldClass("name")}
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
            placeholder="basmati-rice-5kg"
            defaultValue={product?.slug ?? ""}
            className={fieldClass("slug")}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={product?.description ?? ""}
            className={fieldClass("description")}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="categoryId">
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            required
            defaultValue={product?.categoryId ?? ""}
            className={fieldClass("categoryId")}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.parentName ? `${category.parentName} → ${category.name}` : category.name}
                {!category.isActive && " (inactive)"}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-bold text-primary">Price &amp; stock</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="basePrice">
              Price (£)
            </label>
            <input
              id="basePrice"
              name="basePrice"
              inputMode="decimal"
              required
              placeholder="2.40"
              defaultValue={poundsValue(product?.basePrice)}
              className={fieldClass("basePrice")}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="originalPrice">
              Was-price (£) — blank if not on offer
            </label>
            <input
              id="originalPrice"
              name="originalPrice"
              inputMode="decimal"
              placeholder="3.00"
              defaultValue={poundsValue(product?.originalPrice)}
              className={fieldClass("originalPrice")}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="unitLabel">
              Unit label — shown under the price
            </label>
            <input
              id="unitLabel"
              name="unitLabel"
              required
              placeholder="£2.40 / kg"
              defaultValue={product?.unitLabel ?? ""}
              className={fieldClass("unitLabel")}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="origin">
              Origin (optional)
            </label>
            <input
              id="origin"
              name="origin"
              placeholder="India"
              defaultValue={product?.origin ?? ""}
              className={fieldClass("origin")}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="quantity">
              Stock
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              required
              defaultValue={product?.quantity ?? 0}
              className={fieldClass("quantity")}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="lowStockThreshold">
              Low-stock threshold
            </label>
            <input
              id="lowStockThreshold"
              name="lowStockThreshold"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              required
              defaultValue={product?.lowStockThreshold ?? 3}
              className={fieldClass("lowStockThreshold")}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-bold text-primary">Labels &amp; visibility</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Checkbox name="isHalal" label="Halal" defaultChecked={product?.isHalal ?? false} />
          <Checkbox name="isFresh" label="Fresh" defaultChecked={product?.isFresh ?? false} />
          <Checkbox name="isOrganic" label="Organic" defaultChecked={product?.isOrganic ?? false} />
          <Checkbox
            name="isActive"
            label="Visible in the shop"
            defaultChecked={product?.isActive ?? true}
          />
        </div>
      </section>

      {product && (
        <section className="space-y-3 rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-bold text-primary">Images</h2>
          {imageUrls.length === 0 ? (
            <p className="text-sm text-primary/60">No image yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {imageUrls.map((image) => (
                <li key={image.url}>
                  {/* Plain <img>, unsuppressed, exactly as ProductCard and
                      ProductImageGallery do it — next/image adoption is #46 and
                      is a storefront-wide decision, not one to pre-empt here. */}
                  <img
                    src={image.url}
                    alt={image.alt}
                    className="h-24 w-24 rounded-xl border border-black/10 object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-primary/60">
            Uploading and replacing images is coming next — for now these are set when the catalogue
            is seeded.
          </p>
        </section>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden />
          {saving ? "Saving…" : isNew ? "Create product" : "Save changes"}
        </button>
        <Link
          href="/staff/products"
          className="text-sm font-semibold text-primary/70 hover:underline"
        >
          Back to products
        </Link>
      </div>
    </form>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-primary">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-black/20"
      />
      {label}
    </label>
  );
}
