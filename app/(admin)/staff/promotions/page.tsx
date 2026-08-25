import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listCategoriesForAdmin } from "@/lib/repositories/categories";
import { isCampaignLive } from "@/lib/campaign-liveness";
import { listCampaignsForVendor } from "@/lib/campaigns-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";

// Reads the session and this vendor's campaigns — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Promotions" };

function statusLabel(
  campaign: { isActive: boolean; startsAt: Date | null; endsAt: Date | null } | undefined,
  now: Date,
): { text: string; className: string } {
  if (!campaign) {
    return { text: "No campaign", className: "bg-surface-muted text-primary/60" };
  }
  if (isCampaignLive(campaign, now)) {
    return { text: "Live", className: "bg-action-tint text-primary" };
  }
  if (!campaign.isActive) {
    return { text: "Inactive", className: "bg-surface-muted text-primary/60" };
  }
  if (campaign.startsAt && campaign.startsAt > now) {
    return { text: "Scheduled", className: "bg-accent-tint text-accent" };
  }
  return { text: "Expired", className: "bg-danger-tint text-danger" };
}

/**
 * Department campaign list (P8.5e, #356).
 *
 * Only top-level categories are listed — `DepartmentHero` (#346) only ever
 * renders `listTopLevel()`'s results, so a campaign on a sub-category would
 * render nowhere (see plan.md's Deliberately excluded).
 */
export default async function StaffPromotionsPage() {
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

  const allCategories = await listCategoriesForAdmin(auth.vendorId);
  const departments = allCategories.filter((category) => category.parentId === null);
  const campaigns = await listCampaignsForVendor(
    auth.vendorId,
    departments.map((department) => department.id),
  );
  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Promotions</h1>
      <p className="mb-6 text-sm text-primary/60">
        A photo and headline for the homepage hero, per department. The real price shown alongside
        it always comes from your catalogue — the headline is the only part you write.
      </p>

      {departments.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <Megaphone className="mx-auto mb-3 h-8 w-8 text-primary/40" aria-hidden />
          <p className="text-sm text-primary/70">
            No departments yet. Create a top-level category before adding a campaign.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {departments.map((department) => {
            const status = statusLabel(campaigns.get(department.id), now);
            return (
              <li key={department.id} className="rounded-2xl border border-black/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/staff/promotions/${department.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {department.name}
                  </Link>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.className}`}
                  >
                    {status.text}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
