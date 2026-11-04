"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  savePromotion,
  requestPromotionBannerUpload,
  deletePromotionAction,
} from "@/features/admin/promotions";
import { initialPromotionFormState, type PromotionTargetType } from "@/lib/promotion-form";
import { formatLocalInput } from "@/lib/local-datetime";
import type { PromotionRow } from "@/lib/repositories/promotions";
import { FormField } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/icons/Icon";
import {
  IMAGE_CONTENT_TYPE,
  IMAGE_QUALITY,
  MAX_IMAGE_EDGE_PX,
  fitWithinEdge,
} from "@/lib/product-image";

async function toWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithinEdge(bitmap.width, bitmap.height, MAX_IMAGE_EDGE_PX);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser can't process images.");
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, IMAGE_CONTENT_TYPE, IMAGE_QUALITY),
    );
    if (!blob) throw new Error("This browser can't produce WebP images.");
    return blob;
  } finally {
    bitmap.close();
  }
}

export function PromotionForm({
  promotion,
  categories,
  bundles,
  discountCodes,
  currentImageUrl,
  timezone,
}: {
  promotion?: PromotionRow | null;
  categories: { id: string; name: string }[];
  bundles: { id: string; name: string }[];
  discountCodes: { id: string; code: string; description: string | null }[];
  currentImageUrl?: string | null;
  timezone: string;
}) {
  const router = useRouter();
  const [state, action, saving] = useActionState(savePromotion, initialPromotionFormState);

  const initialTarget: PromotionTargetType = promotion?.categoryId
    ? "DEPARTMENT"
    : promotion?.bundleId
      ? "BUNDLE"
      : promotion?.discountCodeId
        ? "DISCOUNT_CODE"
        : "GENERIC";

  const [targetType, setTargetType] = useState<PromotionTargetType>(initialTarget);
  const [imageKey, setImageKey] = useState<string | null>(promotion?.imageKey ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isInvalid = (name: string) => state.field === name;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const blob = await toWebp(file);
      const ticketRes = await requestPromotionBannerUpload(blob.size);
      if (!ticketRes.ok) {
        throw new Error(ticketRes.error);
      }

      const putRes = await fetch(ticketRes.value.url, {
        method: "PUT",
        headers: { "content-type": IMAGE_CONTENT_TYPE },
        body: blob,
      });

      if (!putRes.ok) {
        throw new Error(`Upload failed with status ${putRes.status}`);
      }

      setImageKey(ticketRes.value.key);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload banner";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }

  function handleRemoveImage() {
    setImageKey(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleDelete() {
    if (!promotion?.id) return;
    if (!confirm("Are you sure you want to delete this promotion?")) return;

    startDelete(async () => {
      const res = await deletePromotionAction(promotion.id);
      if (res.ok) {
        router.push("/staff/promotions");
      } else {
        alert(res.error || "Failed to delete promotion");
      }
    });
  }

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-6">
        {promotion?.id && <input type="hidden" name="id" value={promotion.id} />}
        <input type="hidden" name="imageKey" value={imageKey ?? ""} />

        {state.error && (
          <p
            role="alert"
            id="promotion-form-error"
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
            Promotion saved successfully.
          </p>
        )}

        {/* 1. Core Messaging & Neuromarketing */}
        <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-base font-semibold text-primary">Promotional Messaging</h2>

          <FormField
            name="headline"
            label="Headline"
            required
            placeholder="e.g. Fresh Weekend Feast"
            defaultValue={promotion?.headline ?? ""}
            error={isInvalid("headline")}
            errorId="promotion-form-error"
          />

          <FormField
            name="subtitle"
            label="Subtitle (optional)"
            placeholder="e.g. Save 15% on prime butcher cuts this Friday through Sunday"
            defaultValue={promotion?.subtitle ?? ""}
            error={isInvalid("subtitle")}
            errorId="promotion-form-error"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              name="badgeText"
              label="Badge / Tag (optional)"
              placeholder="e.g. Weekend Deal, Customer Favourite"
              defaultValue={promotion?.badgeText ?? ""}
              error={isInvalid("badgeText")}
              errorId="promotion-form-error"
            />
            <FormField
              name="callToActionText"
              label="Button Text (optional)"
              placeholder="e.g. Explore Offers, Shop Now"
              defaultValue={promotion?.callToActionText ?? ""}
              error={isInvalid("callToActionText")}
              errorId="promotion-form-error"
            />
          </div>
        </section>

        {/* 2. Target Association */}
        <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-base font-semibold text-primary">Offer & Target Selection</h2>
          <p className="text-xs text-primary-muted">
            Choose what this promotion highlights. If no specific target is selected, it acts as a
            store-wide promotion.
          </p>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-primary">
              <input
                type="radio"
                name="targetType"
                value="GENERIC"
                checked={targetType === "GENERIC"}
                onChange={() => setTargetType("GENERIC")}
                className="h-4 w-4 text-action"
              />
              Store-wide / Generic
            </label>
            <label className="flex items-center gap-2 text-sm text-primary">
              <input
                type="radio"
                name="targetType"
                value="DEPARTMENT"
                checked={targetType === "DEPARTMENT"}
                onChange={() => setTargetType("DEPARTMENT")}
                className="h-4 w-4 text-action"
              />
              Department
            </label>
            <label className="flex items-center gap-2 text-sm text-primary">
              <input
                type="radio"
                name="targetType"
                value="BUNDLE"
                checked={targetType === "BUNDLE"}
                onChange={() => setTargetType("BUNDLE")}
                className="h-4 w-4 text-action"
              />
              Product Bundle
            </label>
            <label className="flex items-center gap-2 text-sm text-primary">
              <input
                type="radio"
                name="targetType"
                value="DISCOUNT_CODE"
                checked={targetType === "DISCOUNT_CODE"}
                onChange={() => setTargetType("DISCOUNT_CODE")}
                className="h-4 w-4 text-action"
              />
              Discount Code
            </label>
          </div>

          {targetType === "DEPARTMENT" && (
            <div>
              <label htmlFor="categoryId" className="mb-1 block text-sm font-semibold text-primary">
                Select Department <span className="text-danger">*</span>
              </label>
              <select
                id="categoryId"
                name="categoryId"
                defaultValue={promotion?.categoryId ?? ""}
                className="w-full rounded-xl border border-black/20 p-2.5 text-sm bg-white"
              >
                <option value="">-- Choose a department --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === "BUNDLE" && (
            <div>
              <label htmlFor="bundleId" className="mb-1 block text-sm font-semibold text-primary">
                Select Product Bundle <span className="text-danger">*</span>
              </label>
              <select
                id="bundleId"
                name="bundleId"
                defaultValue={promotion?.bundleId ?? ""}
                className="w-full rounded-xl border border-black/20 p-2.5 text-sm bg-white"
              >
                <option value="">-- Choose a bundle --</option>
                {bundles.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === "DISCOUNT_CODE" && (
            <div>
              <label
                htmlFor="discountCodeId"
                className="mb-1 block text-sm font-semibold text-primary"
              >
                Select Discount Code <span className="text-danger">*</span>
              </label>
              <select
                id="discountCodeId"
                name="discountCodeId"
                defaultValue={promotion?.discountCodeId ?? ""}
                className="w-full rounded-xl border border-black/20 p-2.5 text-sm bg-white"
              >
                <option value="">-- Choose a discount code --</option>
                {discountCodes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} {d.description ? `(${d.description})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <FormField
            name="linkUrl"
            label="Custom Link (optional — defaults to target destination)"
            placeholder="/categories/..."
            defaultValue={promotion?.linkUrl ?? ""}
            error={isInvalid("linkUrl")}
            errorId="promotion-form-error"
          />
        </section>

        {/* 3. Scheduling & Priority Ranking */}
        <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-base font-semibold text-primary">Scheduling & Prioritisation</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              name="startsAt"
              label="Starts (optional)"
              type="datetime-local"
              defaultValue={formatLocalInput(promotion?.startsAt ?? null, timezone)}
              error={isInvalid("startsAt")}
              errorId="promotion-form-error"
            />
            <FormField
              name="endsAt"
              label="Ends (optional)"
              type="datetime-local"
              defaultValue={formatLocalInput(promotion?.endsAt ?? null, timezone)}
              error={isInvalid("endsAt")}
              errorId="promotion-form-error"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="priority" className="mb-1 block text-sm font-semibold text-primary">
                Priority Ranking (higher numbers display first)
              </label>
              <input
                id="priority"
                name="priority"
                type="number"
                min="0"
                max="1000"
                defaultValue={promotion?.priority ?? 0}
                className="w-full rounded-xl border border-black/20 p-2.5 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="audienceSegment"
                className="mb-1 block text-sm font-semibold text-primary"
              >
                Audience Segment (Phase V2)
              </label>
              <select
                id="audienceSegment"
                name="audienceSegment"
                defaultValue={promotion?.audienceSegment ?? "ALL"}
                className="w-full rounded-xl border border-black/20 p-2.5 text-sm bg-white"
              >
                <option value="ALL">All Customers</option>
                <option value="NEW_CUSTOMER">New Customers Only</option>
                <option value="RETURNING_CUSTOMER">Returning Customers</option>
                <option value="LOYALTY_MEMBER">Loyalty Club Members</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 pt-2 text-sm font-medium text-primary">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={promotion?.isActive ?? true}
              className="h-4 w-4 rounded border-black/20 text-action"
            />
            Active (display on storefront when within scheduled dates)
          </label>
        </section>

        {/* 4. Visual Media */}
        <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-base font-semibold text-primary">Promotion Banner Photo</h2>
          <p className="text-xs text-primary-muted">
            Upload an eye-catching banner image for the homepage hero carousel.
          </p>

          {previewUrl ? (
            <div className="space-y-3">
              <div className="relative aspect-[16/9] w-full max-w-md overflow-hidden rounded-xl border border-black/10 shadow-sm">
                <img
                  src={previewUrl}
                  alt="Promotion preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={handleRemoveImage}
                className="text-xs font-semibold text-danger hover:underline"
              >
                Remove photo
              </button>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={uploading}
                className="block text-sm text-primary-muted file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-primary/90"
              />
              {uploading && <p className="mt-2 text-xs text-primary-muted">Uploading banner…</p>}
              {uploadError && <p className="mt-2 text-xs text-danger">{uploadError}</p>}
            </div>
          )}

          <FormField
            name="altText"
            label="Image Description (alt text for accessibility)"
            placeholder="e.g. Assorted fresh halal barbecue cuts arranged on slate"
            defaultValue={promotion?.altText ?? ""}
            error={isInvalid("altText")}
            errorId="promotion-form-error"
          />
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={saving || uploading || deleting}>
              <Icon name="save" className="h-4 w-4" />
              {saving ? "Saving…" : promotion ? "Save changes" : "Create promotion"}
            </Button>
            <Link
              href="/staff/promotions"
              className="text-sm font-semibold text-primary-muted hover:underline"
            >
              Cancel
            </Link>
          </div>

          {promotion?.id && (
            <Button
              type="button"
              variant="action"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="border border-danger/30 text-danger hover:bg-danger/10"
            >
              <Icon name="trash" className="h-4 w-4" />
              {deleting ? "Deleting…" : "Delete promotion"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
