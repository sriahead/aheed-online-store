import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderRepository } from "@/lib/orders-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { visibleGroups, type StaffNavTier } from "@/components/staff/nav-items";
import { PLATFORM_NAV_ITEMS } from "@/components/staff/platform-nav-items";
import { PageContainer } from "@/components/layout/PageContainer";
import { Icon } from "@/components/icons/Icon";

// Reads the session and this vendor's live order counts — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Store admin" };

/**
 * The admin panel's front door (P6a, #158).
 *
 * Before this slice, /staff/orders, /staff/loyalty and /staff/discounts were
 * three orphan pages with no index and no navigation — reachable only by typing
 * a URL from memory. This page (and the layout's nav) is what makes them a
 * panel.
 *
 * STAFF and ADMIN, matching /staff/orders: admin-only cards are hidden from a
 * STAFF viewer, exactly as the layout's nav hides their links. Hiding is
 * courtesy — each page still gates itself.
 *
 * SINCE #1177 THE CARDS ARE NOT WRITTEN HERE. They come from
 * `components/staff/nav-items.ts`, grouped, which is the same module the bar in
 * `components/staff/PanelNav.tsx` renders from — so the two surfaces cannot
 * disagree about what the panel contains, or about which group a page sits in.
 * Add a page in the module, not here.
 *
 * That module also fixed a live mismatch this file had carried: /staff/feedback
 * admits STAFF (`requireVendorRole("STAFF", "ADMIN")`) and the bar's staff tier
 * listed it, but the card here sat inside the `isAdmin` block, so a staff member
 * saw the link and no card. Tier now comes from each page's own gate, so that
 * class of drift cannot be expressed.
 */
export default async function StaffHomePage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Staff only"
        message="This area is restricted to store staff. You're signed in, but your account doesn't have access to this store's admin panel."
      />
    );
  }

  let isAdmin = auth.via === "platform-admin" || auth.via === "ADMIN";
  if (isAdmin) {
    const cookieStore = await cookies();
    if (cookieStore.get("admin-tier")?.value === "staff") {
      isAdmin = false;
    }
  }
  const tier: StaffNavTier = isAdmin ? "admin" : "staff";
  const awaitingAction = await getOrderRepository().countForStaff();

  return (
    <PageContainer width="wide">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Store admin</h1>
      <p className="mb-6 text-sm text-primary-muted">
        {awaitingAction === 0
          ? "No orders are awaiting action."
          : `${awaitingAction} ${awaitingAction === 1 ? "order is" : "orders are"} awaiting action.`}
      </p>

      {visibleGroups(tier).map((group) => (
        <section key={group.id} className="mb-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-primary-muted">
            {group.label}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.items.map((item) => {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action"
                >
                  <Icon
                    name={item.icon}
                    className={`mb-3 h-6 w-6 ${item.tone === "action" ? "text-action" : "text-accent"}`}
                  />
                  <p className="font-semibold text-primary">{item.label}</p>
                  <p className="mt-1 text-sm text-primary-muted">{item.description}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {/*
       * Platform admins only, and checked against `auth.via` directly rather than reusing
       * `isAdmin` above — that flag is true for a VENDOR admin too, whereas
       * platform administration refuses anyone whose `auth.via !== "platform-admin"` because a stack trace
       * and platform settings reveal internal paths a vendor-scoped account has no reason to see (#508).
       */}
      {auth.via === "platform-admin" && (
        <section className="mt-12 rounded-2xl border border-purple-200 bg-purple-50/40 p-6 sm:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Icon name="shield-check" className="h-5 w-5 text-purple-700" />
                <h2 className="text-base font-bold text-purple-900 sm:text-lg">
                  Platform Administration
                </h2>
              </div>
              <p className="mt-1 text-xs text-purple-700/80">
                Cross-vendor operator controls and system health. Visible to global platform admins
                only.
              </p>
            </div>
            <span className="rounded-full bg-purple-200/80 px-2.5 py-0.5 text-xs font-bold text-purple-900">
              Platform Admin
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORM_NAV_ITEMS.map((item) => {
              if (item.href === "/staff/errors") {
                return (
                  <Link
                    key={item.href}
                    href="/staff/errors"
                    className="rounded-xl border border-purple-200/80 bg-white p-5 shadow-sm hover:border-purple-600 hover:shadow transition"
                  >
                    <Icon name={item.icon} className="mb-3 h-6 w-6 text-purple-700" />
                    <p className="font-bold text-slate-900">{item.label}</p>
                    <p className="mt-1 text-xs text-slate-600 leading-normal">{item.description}</p>
                  </Link>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-purple-200/80 bg-white p-5 shadow-sm hover:border-purple-600 hover:shadow transition"
                >
                  <Icon name={item.icon} className="mb-3 h-6 w-6 text-purple-700" />
                  <p className="font-bold text-slate-900">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-600 leading-normal">{item.description}</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </PageContainer>
  );
}
