import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getCategoryForAdmin } from "@/lib/categories-service";
import { getCampaignForVendorCategory } from "@/lib/campaigns-service";
import { getEnv } from "@/lib/config";
import { composePublicUrl } from "@/lib/storage";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { CampaignForm } from "@/components/staff/CampaignForm";

// Reads the session and one live category/campaign — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit campaign" };

/**
 * Edit one department's campaign (P8.5e, #356).
 *
 * Keyed on the CATEGORY's id, not a campaign id — a campaign is addressed by
 * the department it belongs to, and `upsertCampaign` creates the row on first
 * save. A sub-category id resolves (categories aren't otherwise restricted
 * here) but never renders on the list page, so it isn't specially refused.
 */
export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = await params;
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's campaigns."
      />
    );
  }

  const [category, campaign] = await Promise.all([
    getCategoryForAdmin(auth.vendorId, categoryId),
    getCampaignForVendorCategory(auth.vendorId, categoryId),
  ]);
  if (!category) notFound();

  const { CDN_BASE_URL } = getEnv();
  const imageUrl =
    campaign?.imageKey && CDN_BASE_URL ? composePublicUrl(CDN_BASE_URL, campaign.imageKey) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">{category.name}</h1>
      <p className="mb-6 text-sm text-primary/60">
        Shown in the homepage hero when active. Leave inactive to fall back to the department&apos;s
        icon and real-price panel.
      </p>
      <CampaignForm
        categoryId={category.id}
        categoryName={category.name}
        campaign={campaign}
        imageUrl={imageUrl}
      />
    </main>
  );
}
