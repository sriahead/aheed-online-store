import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookA } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listSynonymsForStaff } from "@/lib/search-synonyms-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import {
  AddSynonymForm,
  ProposeSynonymsForm,
  SynonymRowForm,
} from "@/components/staff/SynonymDictionary";

// Reads the session and this vendor's dictionary — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Search dictionary" };

/**
 * The curated search synonym dictionary (P2.6 slice 3, #566, closing #396).
 *
 * A shopper typing `bhindi` should reach the okra shelf. This page is where that mapping is
 * curated — by hand, or by approving what the model proposed from the store's own failing
 * searches. Approved entries WIDEN a query; the shopper's own word always stays in the search, so
 * an entry can add results but never silently substitute a different product.
 */
export default async function StaffSearchSynonymsPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's search dictionary."
      />
    );
  }

  const rows = await listSynonymsForStaff(auth.vendorId);
  // Pending proposals lead — the queue is the thing a returning admin came to clear.
  const pending = rows.filter((row) => row.status === "PENDING");
  const settled = rows.filter((row) => row.status !== "PENDING");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Search dictionary</h1>
      <p className="mb-6 text-sm text-primary/60">
        Words your shoppers use that your product names don&apos;t. An entry widens the search — the
        word they typed still counts, so this can only add results, never swap one product for
        another.
      </p>

      <div className="mb-6 space-y-4">
        <AddSynonymForm />
        <ProposeSynonymsForm />
      </div>

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary/60">
            Awaiting your approval ({pending.length})
          </h2>
          <ul className="space-y-3">
            {pending.map((row) => (
              <li key={row.id}>
                <SynonymRowForm row={row} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary/60">
          Dictionary ({settled.length})
        </h2>
        {settled.length === 0 ? (
          <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
            <BookA className="mx-auto mb-3 h-8 w-8 text-primary/40" aria-hidden />
            <p className="text-sm text-primary/70">
              No entries yet. Add one above, or let recent searches suggest some.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {settled.map((row) => (
              <li key={row.id}>
                <SynonymRowForm row={row} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
