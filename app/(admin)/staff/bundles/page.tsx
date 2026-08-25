import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, Plus } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listBundlesForVendor } from "@/lib/bundles-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";

// Reads the session and this vendor's bundles — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Bundles" };

/**
 * Curated bundle list (P8.5c, #347).
 *
 * The refusal branch renders `<PanelRefusal>`, never `return null` —
 * `app/(admin)/layout.tsx` wraps whatever this returns in the portal shell, so
 * a bare `null` would serve 200 with a blank content area that reads as a
 * loading state rather than a refusal (CLAUDE.md's staff-panel section; #350 is
 * an open instance of exactly this being got wrong on another page).
 */
export default async function StaffBundlesPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's bundles."
      />
    );
  }

  const bundles = await listBundlesForVendor(auth.vendorId);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-primary">Bundles</h1>
        <Link
          href="/staff/bundles/new"
          className="flex items-center gap-1.5 rounded-xl bg-action px-3 py-2 text-xs font-bold text-white"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New bundle
        </Link>
      </div>
      <p className="mb-6 text-sm text-primary/60">
        A named group of products shoppers can add in one tap. The price is added up from the
        products&apos; live prices, so there is nothing to keep in step by hand.
      </p>

      {bundles.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-primary/40" aria-hidden />
          <p className="text-sm text-primary/70">
            No bundles yet. Create one to merchandise a set of products together.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {bundles.map((bundle) => (
            <li key={bundle.id} className="rounded-2xl border border-black/10 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Link
                    href={`/staff/bundles/${bundle.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {bundle.name}
                  </Link>
                  <p className="text-xs text-primary/60">
                    {bundle.itemCount} {bundle.itemCount === 1 ? "product" : "products"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    bundle.isActive
                      ? "bg-action-tint text-primary"
                      : "bg-surface-muted text-primary/60"
                  }`}
                >
                  {bundle.isActive ? "Live" : "Hidden"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
