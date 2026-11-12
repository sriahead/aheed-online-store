"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  savePromotion,
  requestPromotionBannerUpload,
  deletePromotionAction,
} from "@/features/admin/promotions";
import { initialPromotionFormState, type PromotionTargetType } from "@/lib/promotion-form";
import { toCategoryOptionGroups } from "@/lib/catalogue-form";
import { formatLocalInput } from "@/lib/local-datetime";
import type {
  PromotionRow,
  EligiblePromotionalProduct,
  AudienceSegment,
  PromotionChannel,
} from "@/lib/promotions-service";
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
  products,
  bundles,
  discountCodes,
  currentImageUrl,
  timezone,
}: {
  promotion?: PromotionRow | null;
  categories: { id: string; name: string; parentId: string | null; isActive?: boolean }[];
  products: EligiblePromotionalProduct[];
  bundles: { id: string; name: string }[];
  discountCodes: {
    id: string;
    code: string;
    description: string | null;
    kind?: "PERCENTAGE" | "FIXED_AMOUNT";
    value?: number;
  }[];
  currentImageUrl?: string | null;
  timezone: string;
}) {
  const router = useRouter();
  const [state, action, saving] = useActionState(savePromotion, initialPromotionFormState);

  const initialTarget: PromotionTargetType = promotion?.productId
    ? "PRODUCT"
    : promotion?.bundleId
      ? "BUNDLE"
      : promotion?.discountCodeId
        ? "DISCOUNT_CODE"
        : "GENERIC";

  const [selectedCategory, setSelectedCategory] = useState<string>(promotion?.categoryId ?? "");
  const [targetType, setTargetType] = useState<PromotionTargetType>(initialTarget);
  const [selectedProduct, setSelectedProduct] = useState<string>(promotion?.productId ?? "");
  const [selectedBundle, setSelectedBundle] = useState<string>(promotion?.bundleId ?? "");
  const [selectedDiscountCode, setSelectedDiscountCode] = useState<string>(
    promotion?.discountCodeId ?? "",
  );
  const [selectedChannel, setSelectedChannel] = useState<PromotionChannel>(
    promotion?.channel ?? "WEBSITE",
  );
  const [selectedAudience, setSelectedAudience] = useState<AudienceSegment>(
    promotion?.audienceSegment ?? "ALL",
  );

  // Controlled messaging fields for live AI generation fill
  const [headline, setHeadline] = useState<string>(promotion?.headline ?? "");
  const [subtitle, setSubtitle] = useState<string>(promotion?.subtitle ?? "");
  const [badgeText, setBadgeText] = useState<string>(promotion?.badgeText ?? "");
  const [callToActionText, setCallToActionText] = useState<string>(
    promotion?.callToActionText ?? "",
  );
  const [altText, setAltText] = useState<string>(promotion?.altText ?? "");

  const [imageKey, setImageKey] = useState<string | null>(promotion?.imageKey ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInvalid = (name: string) => state.field === name;

  // Map categories to CategoryOption shape with isActive
  const categoryOptions = useMemo(() => {
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      isActive: c.isActive ?? true,
    }));
  }, [categories]);

  // Filter eligible promotional products by selected department/sub-department. The chosen
  // product is always kept, so a department filter never blanks the saved choice.
  const filteredProducts = useMemo(() => {
    if (!selectedCategory) return products;
    const inScope = products.filter(
      (p) => p.categoryId === selectedCategory || p.category.parentId === selectedCategory,
    );
    const chosen = products.find((p) => p.id === selectedProduct);
    return chosen && !inScope.includes(chosen) ? [chosen, ...inScope] : inScope;
  }, [products, selectedCategory, selectedProduct]);

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

  async function handleGenerateAi() {
    setGeneratingAi(true);
    setAiError(null);

    try {
      const res = await fetch("/api/admin/promotions/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          categoryId: selectedCategory || null,
          productId: targetType === "PRODUCT" ? selectedProduct || null : null,
          bundleId: targetType === "BUNDLE" ? selectedBundle || null : null,
          discountCodeId: targetType === "DISCOUNT_CODE" ? selectedDiscountCode || null : null,
          audienceSegment: selectedAudience,
          channel: selectedChannel,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || `AI generation failed (${res.status})`);
      }

      const data = (await res.json()) as {
        headline: string;
        subtitle: string;
        badgeText: string;
        callToActionText: string;
        altText: string;
        imageKey: string | null;
        imageUrl: string | null;
      };

      setHeadline(data.headline);
      setSubtitle(data.subtitle);
      setBadgeText(data.badgeText);
      setCallToActionText(data.callToActionText);
      setAltText(data.altText);

      if (data.imageKey && data.imageUrl) {
        setImageKey(data.imageKey);
        setPreviewUrl(data.imageUrl);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate AI promotional content";
      setAiError(msg);
    } finally {
      setGeneratingAi(false);
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

        {/* Two-column layout on large screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Column: Strategy, Targeting & Scope */}
          <div className="space-y-6">
            {/* 1. Offer & Scope Selection */}
            <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
              <h2 className="text-base font-semibold text-primary">
                1. Offer &amp; Scope Selection
              </h2>
              <p className="text-xs text-primary-muted">
                Configure which existing eligible item, department, or store-wide offer to promote.
                Commercial pricing, discounts, and bundles are managed separately in their
                respective modules.
              </p>

              {/* Department Selection (Optional) */}
              <div>
                <label
                  htmlFor="categoryId"
                  className="mb-1 block text-sm font-semibold text-primary"
                >
                  Department / Sub-department (Optional)
                </label>
                <p className="mb-2 text-xs text-primary-muted">
                  Scope this promotion to a department or sub-department. Leave unselected to apply
                  store-wide.
                </p>
                <select
                  id="categoryId"
                  name="categoryId"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-xl border border-black/20 p-2.5 text-sm bg-white"
                >
                  <option value="">-- Store-wide (All Departments) --</option>
                  {toCategoryOptionGroups(categoryOptions).map((group) => (
                    <optgroup key={group.parent.id} label={group.parent.name}>
                      <option value={group.parent.id}>
                        {group.parent.name} — entire department
                      </option>
                      {group.children.map((child) => (
                        <option key={child.id} value={child.id}>
                          ↳ {child.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Offer Type Radio */}
              <div className="pt-2">
                <span className="mb-2 block text-sm font-semibold text-primary">
                  Promotional Offer Type
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-xl border border-black/10 p-3 text-sm font-medium text-primary hover:bg-black/5 cursor-pointer">
                    <input
                      type="radio"
                      name="targetType"
                      value="PRODUCT"
                      checked={targetType === "PRODUCT"}
                      onChange={() => setTargetType("PRODUCT")}
                      className="h-4 w-4 text-action"
                    />
                    <span>Product on Offer (markdown or multi-buy)</span>
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-black/10 p-3 text-sm font-medium text-primary hover:bg-black/5 cursor-pointer">
                    <input
                      type="radio"
                      name="targetType"
                      value="BUNDLE"
                      checked={targetType === "BUNDLE"}
                      onChange={() => setTargetType("BUNDLE")}
                      className="h-4 w-4 text-action"
                    />
                    <span>Product Bundle (/staff/bundles)</span>
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-black/10 p-3 text-sm font-medium text-primary hover:bg-black/5 cursor-pointer">
                    <input
                      type="radio"
                      name="targetType"
                      value="DISCOUNT_CODE"
                      checked={targetType === "DISCOUNT_CODE"}
                      onChange={() => setTargetType("DISCOUNT_CODE")}
                      className="h-4 w-4 text-action"
                    />
                    <span>Discount Code (/staff/discounts)</span>
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-black/10 p-3 text-sm font-medium text-primary hover:bg-black/5 cursor-pointer">
                    <input
                      type="radio"
                      name="targetType"
                      value="GENERIC"
                      checked={targetType === "GENERIC"}
                      onChange={() => setTargetType("GENERIC")}
                      className="h-4 w-4 text-action"
                    />
                    <span>General Campaign (No Specific Item)</span>
                  </label>
                </div>
              </div>

              {/* Conditional Product Picker */}
              {targetType === "PRODUCT" && (
                <div>
                  <label
                    htmlFor="productId"
                    className="mb-1 block text-sm font-semibold text-primary"
                  >
                    Select Product on Offer <span className="text-danger">*</span>
                  </label>
                  <p className="mb-2 text-xs text-primary-muted">
                    Displaying only products with active promotional content (Was-price markdown,
                    active multi-buy, or featured)
                    {selectedCategory ? " within the selected department." : "."}
                  </p>
                  {filteredProducts.length === 0 ? (
                    <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm text-primary-muted">
                      No products with active promotional offers found in this department. Configure
                      a was-price or multi-buy in{" "}
                      <Link href="/staff/products" className="font-medium text-action underline">
                        Products
                      </Link>{" "}
                      first.
                    </div>
                  ) : (
                    <select
                      id="productId"
                      name="productId"
                      value={selectedProduct}
                      onChange={(e) => setSelectedProduct(e.target.value)}
                      className="w-full rounded-xl border border-black/20 p-2.5 text-sm bg-white"
                    >
                      <option value="">-- Choose an eligible promotional product --</option>
                      {filteredProducts.map((p) => {
                        const badges: string[] = [];
                        if (p.originalPrice) {
                          const was = (p.originalPrice / 100).toFixed(2);
                          const now = (p.basePrice / 100).toFixed(2);
                          if (p.originalPrice > p.basePrice) {
                            const save = ((p.originalPrice - p.basePrice) / 100).toFixed(2);
                            badges.push(`Was £${was}, Now £${now} (Save £${save})`);
                          } else {
                            badges.push(`Was £${was}, Now £${now}`);
                          }
                        }
                        if (p.priceTier?.isActive) {
                          badges.push(
                            `Multi-buy: ${p.priceTier.groupQuantity} for £${(
                              p.priceTier.groupPricePence / 100
                            ).toFixed(2)}`,
                          );
                        }
                        if (p.isFeatured && badges.length === 0) {
                          badges.push("Featured on homepage");
                        }
                        const contextLabel = badges.length > 0 ? ` — ${badges.join(" | ")}` : "";
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.unitLabel}){contextLabel}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              )}

              {/* Conditional Bundle Picker */}
              {targetType === "BUNDLE" && (
                <div>
                  <label
                    htmlFor="bundleId"
                    className="mb-1 block text-sm font-semibold text-primary"
                  >
                    Select Product Bundle <span className="text-danger">*</span>
                  </label>
                  <select
                    id="bundleId"
                    name="bundleId"
                    value={selectedBundle}
                    onChange={(e) => setSelectedBundle(e.target.value)}
                    className="w-full rounded-xl border border-black/20 p-2.5 text-sm bg-white"
                  >
                    <option value="">-- Choose an active bundle --</option>
                    {bundles.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conditional Discount Code Picker */}
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
                    value={selectedDiscountCode}
                    onChange={(e) => setSelectedDiscountCode(e.target.value)}
                    className="w-full rounded-xl border border-black/20 p-2.5 text-sm bg-white"
                  >
                    <option value="">-- Choose an active discount code --</option>
                    {discountCodes.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code}
                        {d.kind && typeof d.value === "number"
                          ? ` — ${d.kind === "PERCENTAGE" ? `${d.value / 100}% off` : `£${(d.value / 100).toFixed(2)} off`}`
                          : ""}
                        {d.description ? ` (${d.description})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Multi-Channel Destination (Future Architecture) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-black/10">
                <div>
                  <label
                    htmlFor="channel"
                    className="mb-1 block text-sm font-semibold text-primary"
                  >
                    Marketing Channel
                  </label>
                  <select
                    id="channel"
                    name="channel"
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value as PromotionChannel)}
                    className="w-full rounded-xl border border-black/20 p-2.5 text-sm bg-white"
                  >
                    <option value="WEBSITE">Website Storefront (Live)</option>
                    <option value="WHATSAPP">WhatsApp Broadcast (Preview)</option>
                    <option value="FACEBOOK">Facebook Post (Preview)</option>
                    <option value="INSTAGRAM">Instagram Promo (Preview)</option>
                  </select>
                </div>

                <FormField
                  name="linkUrl"
                  label="Custom Link (optional — defaults to target destination)"
                  placeholder="/categories/... or /products/..."
                  defaultValue={promotion?.linkUrl ?? ""}
                  error={isInvalid("linkUrl")}
                  errorId="promotion-form-error"
                />
              </div>
            </section>

            {/* 2. Scheduling & Prioritisation */}
            <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
              <h2 className="text-base font-semibold text-primary">
                2. Scheduling &amp; Prioritisation
              </h2>

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
              <p className="-mt-2 text-xs text-primary-muted">
                Leave both blank to run the promotion until you switch it off. Times are the
                store&apos;s local time.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="priority"
                    className="mb-1 block text-sm font-semibold text-primary"
                  >
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
                    Audience Segment
                  </label>
                  <select
                    id="audienceSegment"
                    name="audienceSegment"
                    value={selectedAudience}
                    onChange={(e) => setSelectedAudience(e.target.value as AudienceSegment)}
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
          </div>

          {/* Right Column: AI Generation, Messaging & Creative */}
          <div className="space-y-6">
            {/* Psychology-Led AI Content Generation (Moved above Promotional messaging) */}
            <div className="rounded-2xl border border-action/20 bg-action-tint/30 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <Icon name="sparkles" className="h-5 w-5 text-action shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-primary">
                    Psychology-Led AI Content Generation
                  </h3>
                  <p className="text-xs text-primary-muted leading-relaxed">
                    Generates engaging, conversion-focused promotional messages and banners
                    engineered using{" "}
                    <strong>
                      consumer psychology, behavioural economics (loss aversion &amp; anchoring),
                      cognitive biases (social proof), pricing psychology, and neuromarketing
                      principles
                    </strong>{" "}
                    tailored to your selected offer and target audience.
                  </p>
                </div>
              </div>

              {aiError && (
                <p className="rounded-xl bg-danger-tint px-3 py-2 text-xs font-medium text-danger">
                  {aiError}
                </p>
              )}

              <Button
                type="button"
                variant="action"
                onClick={handleGenerateAi}
                disabled={generatingAi || saving}
                className="text-xs font-semibold"
              >
                <Icon name="sparkles" className="h-4 w-4 mr-1.5" />
                {generatingAi
                  ? "Generating psychology-backed copy & banner…"
                  : "Generate Message and Banner Using AI"}
              </Button>
            </div>

            {/* 3. Promotional Messaging */}
            <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
              <h2 className="text-base font-semibold text-primary">3. Promotional Messaging</h2>

              <div>
                <label htmlFor="headline" className="mb-1 block text-sm font-semibold text-primary">
                  Headline <span className="text-danger">*</span>
                </label>
                <input
                  id="headline"
                  name="headline"
                  required
                  placeholder="e.g. Fresh Weekend Feast"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  className="w-full rounded-xl border border-black/20 p-2.5 text-sm"
                />
              </div>

              <div>
                <label htmlFor="subtitle" className="mb-1 block text-sm font-semibold text-primary">
                  Subtitle (optional)
                </label>
                <input
                  id="subtitle"
                  name="subtitle"
                  placeholder="e.g. Save 15% on prime butcher cuts this Friday through Sunday"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full rounded-xl border border-black/20 p-2.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="badgeText"
                    className="mb-1 block text-sm font-semibold text-primary"
                  >
                    Badge / Tag (optional)
                  </label>
                  <input
                    id="badgeText"
                    name="badgeText"
                    placeholder="e.g. Weekend Deal, Customer Favourite"
                    value={badgeText}
                    onChange={(e) => setBadgeText(e.target.value)}
                    className="w-full rounded-xl border border-black/20 p-2.5 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="callToActionText"
                    className="mb-1 block text-sm font-semibold text-primary"
                  >
                    Button Text (optional)
                  </label>
                  <input
                    id="callToActionText"
                    name="callToActionText"
                    placeholder="e.g. Explore Offers, Shop Now"
                    value={callToActionText}
                    onChange={(e) => setCallToActionText(e.target.value)}
                    className="w-full rounded-xl border border-black/20 p-2.5 text-sm"
                  />
                </div>
              </div>
            </section>

            {/* 4. Visual Media & Banner */}
            <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
              <div>
                <h2 className="text-base font-semibold text-primary">
                  4. Promotional Banner &amp; Creative
                </h2>
                <p className="text-xs text-primary-muted">
                  Upload a custom photo or preview the AI-generated imagery.
                </p>
              </div>

              {previewUrl ? (
                <div className="space-y-3 pt-2">
                  <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-black/10 shadow-sm">
                    <img
                      src={previewUrl}
                      alt={altText || "Promotion preview"}
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
                <div className="pt-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="block text-sm text-primary-muted file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-primary/90"
                  />
                  {uploading && (
                    <p className="mt-2 text-xs text-primary-muted">Uploading banner…</p>
                  )}
                  {uploadError && <p className="mt-2 text-xs text-danger">{uploadError}</p>}
                </div>
              )}

              <div>
                <label htmlFor="altText" className="mb-1 block text-sm font-semibold text-primary">
                  Promotion Image Description (alt text for accessibility)
                </label>
                <input
                  id="altText"
                  name="altText"
                  placeholder="e.g. Special promotion: 5% off weekend Halal Meat with code WEEKENDMEAT5"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  className="w-full rounded-xl border border-black/20 p-2.5 text-sm"
                />
                <p className="mt-1 text-xs text-primary-muted">
                  Describes the promotion and offer for screen readers and SEO, rather than visual
                  photography details.
                </p>
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={saving || uploading || deleting || generatingAi}>
              <Icon name="save" className="h-4 w-4 mr-1.5" />
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
              disabled={deleting || saving || generatingAi}
              className="border border-danger/30 text-danger hover:bg-danger/10"
            >
              <Icon name="trash" className="h-4 w-4 mr-1.5" />
              {deleting ? "Deleting…" : "Delete promotion"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
