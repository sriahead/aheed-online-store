import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listPromotionsForAdmin } from "@/lib/promotions-service";
import { isPromotionLive } from "@/lib/promotion-liveness";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { IconMedallion } from "@/components/icons/IconMedallion";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/icons/Icon";
import type { PromotionRow } from "@/lib/repositories/promotions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Promotions" };

function statusLabel(promo: PromotionRow, now: Date): { text: string; className: string } {
  if (isPromotionLive(promo, now)) {
    return { text: "Live", className: "bg-action-tint text-primary" };
  }
  if (!promo.isActive) {
    return { text: "Inactive", className: "bg-surface-muted text-primary-muted" };
  }
  if (promo.startsAt && promo.startsAt > now) {
    return { text: "Scheduled", className: "bg-accent-tint text-accent" };
  }
  return { text: "Expired", className: "bg-danger-tint text-danger" };
}

function targetLabel(promo: PromotionRow): string {
  if (promo.category) return `Department: ${promo.category.name}`;
  if (promo.bundle) return `Bundle: ${promo.bundle.name}`;
  if (promo.discountCode) return `Discount: ${promo.discountCode.code}`;
  return "Store-wide";
}

export default async function StaffPromotionsPage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store staff only"
        message="You're signed in, but your account doesn't have permission to manage this store's promotions."
      />
    );
  }

  const promotions = await listPromotionsForAdmin(auth.vendorId);
  const now = new Date();

  return (
    <PageContainer width="wide" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Promotions</h1>
          <p className="text-sm text-primary-muted">
            Manage promotional campaigns, bundles, and discount highlights displayed in your
            homepage hero.
          </p>
        </div>
        <Link href="/staff/promotions/new">
          <Button variant="primary">
            <Icon name="plus" className="h-4 w-4" />
            Create promotion
          </Button>
        </Link>
      </div>

      {promotions.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white p-12 text-center shadow-sm">
          <IconMedallion icon="megaphone" size={40} className="mx-auto mb-3" decorative />
          <h2 className="text-base font-semibold text-primary">No promotions yet</h2>
          <p className="mt-1 text-sm text-primary-muted">
            Create your first promotion to highlight special deals, bundles, or discount codes.
          </p>
          <div className="mt-5">
            <Link href="/staff/promotions/new">
              <Button variant="primary">Create promotion</Button>
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {promotions.map((promo) => {
            const status = statusLabel(promo, now);
            const target = targetLabel(promo);

            return (
              <li
                key={promo.id}
                className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/staff/promotions/${promo.id}`}
                      className="text-base font-bold text-primary hover:underline"
                    >
                      {promo.headline}
                    </Link>
                    {promo.badgeText && (
                      <span className="rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-semibold text-accent">
                        {promo.badgeText}
                      </span>
                    )}
                  </div>
                  {promo.subtitle && (
                    <p className="text-sm text-primary-muted line-clamp-1">{promo.subtitle}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-black/60 pt-1">
                    <span className="rounded-md bg-surface-muted px-2 py-0.5 font-medium">
                      {target}
                    </span>
                    {promo.priority > 0 && (
                      <span className="rounded-md bg-surface-muted px-2 py-0.5 font-medium">
                        Priority: {promo.priority}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${status.className}`}
                  >
                    {status.text}
                  </span>
                  <Link
                    href={`/staff/promotions/${promo.id}`}
                    className="rounded-xl border border-black/10 bg-surface px-3 py-1.5 text-xs font-semibold text-primary hover:bg-surface-muted"
                  >
                    Edit
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
