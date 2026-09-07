"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import { saveProduct } from "@/features/admin/catalogue";
import { initialCatalogueState, toCategoryOptionGroups } from "@/lib/catalogue-form";
import { ProductImageUploader } from "@/components/staff/ProductImageUploader";
import { ProductImageManager } from "@/components/staff/ProductImageManager";
import type { AdminProductDetail } from "@/lib/repositories/products";
import type { AdminCategoryRow } from "@/lib/repositories/categories";
import type { BrandSummary } from "@/lib/repositories/brands";
import { errorInputClass, inputClass, labelClass } from "@/lib/form-classes";

/**
 * Product create/edit form (P6b1, #159).
 *
 * One component for both modes: `product` is null when creating. The action
 * behind it decides create-vs-update from the hidden productId, so nothing here
 * branches on mode beyond default values and labels.
 *
 * Images are rendered here and uploaded by ProductImageUploader (P6b2, #167),
 * which sits outside this component's <form> because an upload is its own
 * immediate write rather than part of a field save. Replacing the primary image
 * is all this surface does; add/remove/reorder is #173.
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

/** Pounds, for a form — the DB stores integer pence and formatPrice() adds the symbol. */
function poundsValue(pence: number | null | undefined): string {
  return pence === null || pence === undefined ? "" : (pence / 100).toFixed(2);
}

export interface ProductFormProps {
  product: AdminProductDetail | null;
  categories: AdminCategoryRow[];
  /** #569 — the vendor's brands, for the picker. Empty until staff create one at /staff/brands. */
  brands: BrandSummary[];
  /**
   * Public URLs composed by the PAGE, not here. `composePublicUrl` lives in
   * lib/storage.ts beside the aws4fetch client, so importing it from a
   * "use client" module would drag the signer and lib/config into the browser
   * bundle. The storefront's ProductCard can import it because it is a server
   * component; this one cannot.
   */
  imageUrls: { id: string; url: string; alt: string; isPrimary: boolean }[];
}

export function ProductForm({ product, categories, brands, imageUrls }: ProductFormProps) {
  const [state, action, saving] = useActionState(saveProduct, initialCatalogueState);
  const isNew = product === null;

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
      "aria-describedby": invalid ? "product-form-error" : undefined,
    };
  };

  return (
    <>
      <form action={action} className="space-y-6">
        {product && <input type="hidden" name="productId" value={product.id} />}

        {state.error && (
          <p
            role="alert"
            id="product-form-error"
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
              placeholder="basmati-rice-5kg"
              defaultValue={product?.slug ?? ""}
              {...fieldProps("slug")}
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
              {...fieldProps("description")}
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
              {...fieldProps("categoryId")}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {/* #630 — one optgroup per department, with the department itself
                  as the first selectable option inside it. Both tiers are
                  assignable and both seed paths use them, so the department
                  must stay pickable; a cascade would have removed that
                  silently. */}
              {toCategoryOptionGroups(categories).map((group) => (
                <optgroup key={group.parent.id} label={group.parent.name}>
                  <option value={group.parent.id}>
                    {group.parent.name} — directly in this department
                    {!group.parent.isActive && " (inactive)"}
                  </option>
                  {group.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                      {!child.isActive && " (inactive)"}
                    </option>
                  ))}
                </optgroup>
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
                {...fieldProps("basePrice")}
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
                {...fieldProps("originalPrice")}
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
                {...fieldProps("unitLabel")}
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
                {...fieldProps("origin")}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="brandId">
                Brand (optional)
              </label>
              <select
                id="brandId"
                name="brandId"
                defaultValue={product?.brandId ?? ""}
                {...fieldProps("brandId")}
              >
                <option value="">No brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
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
                {...fieldProps("quantity")}
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
                {...fieldProps("lowStockThreshold")}
              />
            </div>
          </div>
        </section>

        {/*
          P8.5d (#348) — the multi-buy tier. Its own section rather than another
          pair of fields in "Price & stock", because it is a different KIND of
          price: "Was-price" above marks one unit down, this prices a group. A
          product can carry both and they mean different things.

          Leaving both number fields blank removes any multi-buy. Unticking the
          checkbox keeps the numbers but stops it applying, so a seasonal offer
          can be switched back on without being retyped.
        */}
        <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-bold text-primary">Multi-buy offer</h2>
          <p className="text-xs text-black/60">
            Applies automatically — the shopper types nothing. Leave both fields blank for no
            multi-buy.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="tierGroupQuantity">
                Quantity — how many the price covers
              </label>
              <input
                id="tierGroupQuantity"
                name="tierGroupQuantity"
                type="number"
                inputMode="numeric"
                min={2}
                step={1}
                placeholder="3"
                defaultValue={product?.tier?.groupQuantity ?? ""}
                {...fieldProps("tierGroupQuantity")}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="tierGroupPrice">
                Multi-buy price (£) for that quantity
              </label>
              <input
                id="tierGroupPrice"
                name="tierGroupPrice"
                inputMode="decimal"
                placeholder="10.00"
                defaultValue={poundsValue(product?.tier?.groupPricePence)}
                {...fieldProps("tierGroupPrice")}
              />
            </div>
          </div>

          <Checkbox
            name="tierIsActive"
            label="Multi-buy is running"
            defaultChecked={product?.tier?.isActive ?? true}
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-bold text-primary">Labels &amp; visibility</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Checkbox name="isHalal" label="Halal" defaultChecked={product?.isHalal ?? false} />
            <Checkbox name="isFresh" label="Fresh" defaultChecked={product?.isFresh ?? false} />
            <Checkbox
              name="isOrganic"
              label="Organic"
              defaultChecked={product?.isOrganic ?? false}
            />
            <Checkbox
              name="isVegetarian"
              label="Vegetarian"
              defaultChecked={product?.isVegetarian ?? false}
            />
            <Checkbox
              name="isGlutenFree"
              label="Gluten free"
              defaultChecked={product?.isGlutenFree ?? false}
            />
            <Checkbox
              name="isFeatured"
              label="Featured on homepage"
              defaultChecked={product?.isFeatured ?? false}
            />
            <Checkbox
              name="isActive"
              label="Visible in the shop"
              defaultChecked={product?.isActive ?? true}
            />
          </div>
        </section>

        {/*
          #569 — HMC certification is its OWN section, not another checkbox in "Labels & visibility",
          because it is a claim about a third party rather than a description of the product. #239
          was a real incident of asserting "100% Certified HMC Halal" with no basis; the reference
          and verified date are what stop this being the same thing one product at a time.
          lib/catalogue-form.ts rejects the save if the box is ticked and either field is blank, and
          nulls both when it is unticked.
        */}
        <section className="space-y-3 rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-bold text-primary">HMC certification</h2>
          <p className="text-xs text-primary-muted">
            Only tick this when you hold a current HMC certificate for the product. Both fields
            below are required when it is ticked.
          </p>
          <Checkbox
            name="isHmcCertified"
            label="HMC certified"
            defaultChecked={product?.isHmcCertified ?? false}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="hmcReference">
                Certificate reference
              </label>
              <input
                id="hmcReference"
                name="hmcReference"
                placeholder="HMC/2026/01234"
                defaultValue={product?.hmcReference ?? ""}
                {...fieldProps("hmcReference")}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="hmcVerifiedAt">
                Verified on
              </label>
              {/*
                `type="date"`, NOT datetime-local: a date-only ISO value has no timezone ambiguity,
                so this needs none of lib/local-datetime.ts's machinery. See parseHmcFields.
              */}
              <input
                id="hmcVerifiedAt"
                name="hmcVerifiedAt"
                type="date"
                defaultValue={
                  product?.hmcVerifiedAt
                    ? new Date(product.hmcVerifiedAt).toISOString().slice(0, 10)
                    : ""
                }
                {...fieldProps("hmcVerifiedAt")}
              />
            </div>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {saving ? "Saving…" : isNew ? "Create product" : "Save changes"}
          </button>
          <Link
            href="/staff/products"
            className="text-sm font-semibold text-primary-muted hover:underline"
          >
            Back to products
          </Link>
        </div>
      </form>

      {/*
        Images sit OUTSIDE the form, deliberately (P6b2, #167). Uploading is its
        own immediate write with its own button — it does not wait for "Save
        changes" and must not be submitted by it — and nesting a second set of
        controls inside the product form would make a file input ride along with
        every field save. A product must exist before its image can be keyed on
        its id, so there is nothing to show while creating one.
      */}
      {product && (
        <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-bold text-primary">Images</h2>
          <ProductImageManager
            productId={product.id}
            productName={product.name}
            images={imageUrls}
            imageNeedsReview={product.imageNeedsReview}
          />
          <div className="border-t border-black/10 pt-4">
            <p className="mb-1 text-xs font-medium text-primary-muted">
              Replace the primary image (uploads directly over it, keeping its position)
            </p>
            <ProductImageUploader productId={product.id} productName={product.name} />
          </div>
        </section>
      )}
    </>
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
