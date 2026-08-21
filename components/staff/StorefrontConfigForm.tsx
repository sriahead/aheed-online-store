"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStorefrontConfig } from "@/features/admin/storefront";
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
    </div>
  );
}
