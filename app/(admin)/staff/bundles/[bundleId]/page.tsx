import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listProductsForAdmin } from "@/lib/products-service";
import { getBundleForVendor } from "@/lib/bundles-service";
import { removeBundle } from "@/features/admin/bundles";
import { getEnv } from "@/lib/config";
import { composePublicUrl } from "@/lib/storage";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { BundleForm } from "@/components/staff/BundleForm";

// Reads the session and one live bundle — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit bundle" };

/**
 * Create or edit one curated bundle (P8.5c, #347).
 *
 * `/staff/bundles/new` is the create route — `BundleForm` submits with no
 * hidden `bundleId`, so `saveBundle` creates and then redirects here under the
 * new id. Any other id is looked up scoped to the vendor, so another vendor's
 * bundle 404s rather than rendering.
 */
const PRODUCT_PICKER_LIMIT = 200;

export default async function EditBundlePage({
  params,
}: {
  params: Promise<{ bundleId: string }>;
}) {
  const { bundleId } = await params;
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

  const isNew = bundleId === "new";

  // The picker offers active products only: a bundle built from an inactive
  // product would render with that line silently dropped (bundle-pricing's
  // availability rule), which looks like a bug from the admin's side.
  const [bundle, products] = await Promise.all([
    isNew ? Promise.resolve(null) : getBundleForVendor(auth.vendorId, bundleId),
    listProductsForAdmin(auth.vendorId, { take: PRODUCT_PICKER_LIMIT, isActive: true }),
  ]);
  if (!isNew && !bundle) notFound();

  const { CDN_BASE_URL } = getEnv();
  const imageUrl =
    bundle?.imageKey && CDN_BASE_URL ? composePublicUrl(CDN_BASE_URL, bundle.imageKey) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-primary">
          {bundle ? bundle.name : "New bundle"}
        </h1>
        {bundle && (
          <form action={removeBundle}>
            <input type="hidden" name="bundleId" value={bundle.id} />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl border border-danger/40 px-3 py-2 text-xs font-bold text-danger hover:bg-danger-tint"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          </form>
        )}
      </div>
      <p className="mb-6 text-sm text-primary/60">
        <Link href="/staff/bundles" className="hover:underline">
          Back to bundles
        </Link>
      </p>

      <BundleForm
        bundle={bundle}
        products={products.items.map((product) => ({ id: product.id, name: product.name }))}
        imageUrl={imageUrl}
      />
    </main>
  );
}
