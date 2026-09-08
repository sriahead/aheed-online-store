"use client";

import { useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Theme, VendorBranding, VendorConfig } from "@/lib/repositories/vendor";
import {
  applyStorefrontTheme,
  updateDeliveryRules,
  updateStorefrontConfig,
} from "@/features/admin/storefront";
import {
  DELIVERY_FEE_FIELD,
  FREE_DELIVERY_THRESHOLD_FIELD,
  MINIMUM_ORDER_FIELD,
  initialDeliveryRulesState,
  penceToPoundsValue,
} from "@/lib/delivery-rules-form";
import { VendorLogoUploader } from "@/components/staff/VendorLogoUploader";

/** The eight `VendorBranding` brand primitives — every column that is a hex string. */
type BrandColorFieldName =
  | "brandGreenDark"
  | "brandGreen"
  | "brandOrange"
  | "brandRed"
  | "brandCream"
  | "brandGreenTint"
  | "brandOrangeTint"
  | "brandRedTint";

/** #639 — all eight, in the order the form presents them (previously only the first two). */
const BRAND_COLOR_FIELDS = [
  { name: "brandGreenDark", label: "Primary Brand Color (Dark)", placeholder: "e.g. #2e4d26" },
  { name: "brandGreen", label: "Primary Brand Color", placeholder: "e.g. #467339" },
  { name: "brandOrange", label: "Accent Brand Color (Orange)", placeholder: "e.g. #f57c00" },
  { name: "brandRed", label: "Danger Brand Color (Red)", placeholder: "e.g. #d32f2f" },
  { name: "brandCream", label: "Surface Brand Color (Cream)", placeholder: "e.g. #f5f5f0" },
  { name: "brandGreenTint", label: "Primary Tint", placeholder: "e.g. #e8f5e9" },
  { name: "brandOrangeTint", label: "Accent Tint", placeholder: "e.g. #fff3e0" },
  { name: "brandRedTint", label: "Danger Tint", placeholder: "e.g. #ffebee" },
] as const satisfies readonly { name: BrandColorFieldName; label: string; placeholder: string }[];

export function StorefrontConfigForm({
  initialConfig,
  initialBranding,
  themes,
  logoUrl,
}: {
  initialConfig: VendorConfig;
  initialBranding: VendorBranding;
  themes: Theme[];
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [themePending, startThemeTransition] = useTransition();
  const [selectedThemeId, setSelectedThemeId] = useState(initialBranding.themeId ?? "");

  // #634 — its own form and its own state. The branding form above is
  // fire-and-forget; these three need a field-level error rendered against the
  // input that caused it, because they reach real money arithmetic on the
  // checkout path (lib/order-totals.ts) and a silently-rejected save would be
  // indistinguishable from a successful one.
  const [deliveryState, saveDeliveryRules, deliveryPending] = useActionState(
    updateDeliveryRules,
    initialDeliveryRulesState,
  );

  async function action(formData: FormData) {
    const bannerNote = formData.get("bannerNote") as string;
    const heroSubtitle = formData.get("heroSubtitle") as string;
    const brandGreenDark = formData.get("brandGreenDark") as string;
    const brandGreen = formData.get("brandGreen") as string;
    const brandOrange = formData.get("brandOrange") as string;
    const brandRed = formData.get("brandRed") as string;
    const brandCream = formData.get("brandCream") as string;
    const brandGreenTint = formData.get("brandGreenTint") as string;
    const brandOrangeTint = formData.get("brandOrangeTint") as string;
    const brandRedTint = formData.get("brandRedTint") as string;

    startTransition(async () => {
      await updateStorefrontConfig({
        bannerNote: bannerNote || null,
        heroSubtitle: heroSubtitle || null,
        brandGreenDark: brandGreenDark || undefined,
        brandGreen: brandGreen || undefined,
        brandOrange: brandOrange || undefined,
        brandRed: brandRed || undefined,
        brandCream: brandCream || undefined,
        brandGreenTint: brandGreenTint || undefined,
        brandOrangeTint: brandOrangeTint || undefined,
        brandRedTint: brandRedTint || undefined,
      });
      router.refresh();
    });
  }

  function applyTheme() {
    if (!selectedThemeId) return;
    startThemeTransition(async () => {
      await applyStorefrontTheme(selectedThemeId);
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <VendorLogoUploader currentLogoUrl={logoUrl} />

      {/* #75 — selecting a theme COPIES its eight values onto the fields below;
          it does not bind them, so any colour may still be edited afterwards. */}
      {themes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-black/10 p-4">
          <label htmlFor="themeId" className="font-bold text-black">
            Apply a theme
          </label>
          <p className="text-sm text-black/60">
            Choosing a theme copies its colours onto the fields below. You can still adjust any of
            them afterwards.
          </p>
          <div className="flex gap-3">
            <select
              id="themeId"
              name="themeId"
              value={selectedThemeId}
              onChange={(event) => setSelectedThemeId(event.target.value)}
              className="rounded-lg border border-black/20 p-3"
            >
              <option value="">Select a theme…</option>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyTheme}
              disabled={themePending || !selectedThemeId}
              className="rounded-full bg-primary px-6 py-3 font-bold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {themePending ? "Applying…" : "Apply Theme"}
            </button>
          </div>
        </div>
      )}

      <form action={action} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="heroSubtitle" className="font-bold text-black">
            Hero Subtitle
          </label>
          <input
            id="heroSubtitle"
            name="heroSubtitle"
            type="text"
            defaultValue={initialConfig.heroSubtitle || ""}
            className="rounded-lg border border-black/20 p-3"
            placeholder="e.g. 100% Certified HMC Halal Fresh Meat Cut Daily"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="bannerNote" className="font-bold text-black">
            Banner Note
          </label>
          <input
            id="bannerNote"
            name="bannerNote"
            type="text"
            defaultValue={initialConfig.bannerNote || ""}
            className="rounded-lg border border-black/20 p-3"
            placeholder="e.g. Same-Day Local Dispatch"
          />
        </div>

        {BRAND_COLOR_FIELDS.map((field) => (
          <div key={field.name} className="flex flex-col gap-2">
            <label htmlFor={field.name} className="font-bold text-black">
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type="text"
              defaultValue={initialBranding[field.name] || ""}
              className="rounded-lg border border-black/20 p-3 font-mono"
              placeholder={field.placeholder}
            />
          </div>
        ))}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary py-3 font-bold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save Config"}
        </button>
      </form>

      {/* #634 — until this shipped, changing a delivery fee needed a developer
          with database access: VendorConfig carried all three columns and
          prisma/seed.ts was their only writer. A sibling <form>, never nested —
          HTML forbids that, and the two save independently. */}
      <form action={saveDeliveryRules} className="flex flex-col gap-6">
        <div>
          <h2 className="font-bold text-black">Delivery rules</h2>
          <p className="mt-1 text-sm text-black/60">
            What delivery costs and when it is free. These apply to every order at checkout.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="deliveryFee" className="font-bold text-black">
            Delivery fee (£)
          </label>
          <input
            id="deliveryFee"
            name="deliveryFee"
            type="text"
            inputMode="decimal"
            defaultValue={penceToPoundsValue(initialConfig.deliveryFeePence)}
            className={fieldClass(deliveryState.field === DELIVERY_FEE_FIELD)}
            placeholder="e.g. 3.49"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="freeDeliveryThreshold" className="font-bold text-black">
            Free delivery over (£)
          </label>
          <input
            id="freeDeliveryThreshold"
            name="freeDeliveryThreshold"
            type="text"
            inputMode="decimal"
            defaultValue={penceToPoundsValue(initialConfig.freeDeliveryThresholdPence)}
            className={fieldClass(deliveryState.field === FREE_DELIVERY_THRESHOLD_FIELD)}
            placeholder="e.g. 30.00"
          />
          <p className="text-xs text-black/60">
            Leave blank to never offer free delivery. Zero would make every order qualify.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="minimumOrder" className="font-bold text-black">
            Minimum order (£)
          </label>
          <input
            id="minimumOrder"
            name="minimumOrder"
            type="text"
            inputMode="decimal"
            defaultValue={penceToPoundsValue(initialConfig.minimumOrderPence)}
            className={fieldClass(deliveryState.field === MINIMUM_ORDER_FIELD)}
            placeholder="e.g. 0.00"
          />
          <p className="text-xs text-black/60">
            Enter 0.00 for no minimum. A shopper below this cannot check out.
          </p>
        </div>

        {deliveryState.error && (
          <p className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
            {deliveryState.error}
          </p>
        )}
        {deliveryState.saved && !deliveryState.error && (
          <p className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary">
            Delivery rules saved.
          </p>
        )}

        <button
          type="submit"
          disabled={deliveryPending}
          className="rounded-full bg-primary py-3 font-bold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {deliveryPending ? "Saving…" : "Save Delivery Rules"}
        </button>
      </form>
    </div>
  );
}

/** Delivery-rule input styling, with the offending field outlined on a refusal. */
function fieldClass(hasError: boolean): string {
  return `rounded-lg border p-3 ${hasError ? "border-danger bg-danger-tint" : "border-black/20"}`;
}
