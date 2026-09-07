"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDeliveryRules, updateStorefrontConfig } from "@/features/admin/storefront";
import {
  DELIVERY_FEE_FIELD,
  FREE_DELIVERY_THRESHOLD_FIELD,
  MINIMUM_ORDER_FIELD,
  initialDeliveryRulesState,
  penceToPoundsValue,
} from "@/lib/delivery-rules-form";
import { VendorLogoUploader } from "@/components/staff/VendorLogoUploader";

export function StorefrontConfigForm({
  initialConfig,
  initialBranding,
  logoUrl,
}: {
  initialConfig: any;
  initialBranding: any;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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

    startTransition(async () => {
      await updateStorefrontConfig({
        bannerNote: bannerNote || null,
        heroSubtitle: heroSubtitle || null,
        brandGreenDark: brandGreenDark || undefined,
        brandGreen: brandGreen || undefined,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <VendorLogoUploader currentLogoUrl={logoUrl} />

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

        <div className="flex flex-col gap-2">
          <label htmlFor="brandGreenDark" className="font-bold text-black">
            Primary Brand Color (Dark)
          </label>
          <input
            id="brandGreenDark"
            name="brandGreenDark"
            type="text"
            defaultValue={initialBranding.brandGreenDark || ""}
            className="rounded-lg border border-black/20 p-3 font-mono"
            placeholder="e.g. #2e4d26"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="brandGreen" className="font-bold text-black">
            Primary Brand Color
          </label>
          <input
            id="brandGreen"
            name="brandGreen"
            type="text"
            defaultValue={initialBranding.brandGreen || ""}
            className="rounded-lg border border-black/20 p-3 font-mono"
            placeholder="e.g. #467339"
          />
        </div>

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
