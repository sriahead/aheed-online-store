import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderRepository } from "@/lib/orders-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { visibleGroups, type StaffNavTier } from "@/components/staff/nav-items";
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

      <div className="grid gap-4 sm:grid-cols-2">
        {/*
         * Platform admins only, and checked against `auth.via` directly rather than reusing
         * `isAdmin` above — that flag is true for a VENDOR admin too, whereas
         * /staff/errors refuses anyone whose `auth.via !== "platform-admin"` because a stack trace
         * can reveal internal paths a vendor-scoped account has no reason to see (#508). Reusing
         * `isAdmin` would render a link that every store admin could see and none of them could
         * open.
         *
         * This is also why the card is here and not in `components/staff/PanelNav.tsx`: that nav is
         * vendor-scoped chrome and its `currentTier` prop has no way to express "platform admin".
         * `tests/staff-nav-parity.test.ts` excludes this route from its parity set for the same
         * reason.
         *
         * Deliberately NOT gated on the `admin-tier` cookie: that cookie simulates what a STAFF
         * member of this vendor sees, and this page is not a vendor page at all.
         */}
        {auth.via === "platform-admin" && (
          <Link
            href="/staff/errors"
            className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action"
          >
            <Icon name="bug" className="mb-3 h-6 w-6 text-danger" />
            <p className="font-semibold text-primary">Error events</p>
            <p className="mt-1 text-sm text-primary-muted">
              Recent server-side errors across the platform. Platform admins only.
            </p>
          </Link>
        )}
      </div>
    </PageContainer>
  );
}
