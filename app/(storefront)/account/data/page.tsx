import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getDataRightsRepository } from "@/lib/data-rights-service";
import { eraseConfirmationMode } from "@/lib/data-rights-form";
import { NameForm } from "@/components/account/NameForm";
import { EraseDataForm } from "@/components/account/EraseDataForm";

// Reads the session and the viewer's own account state — must render per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your data" };

/**
 * Your data (P7b, #216) — the self-service surface behind /privacy's promise of
 * access, rectification and deletion.
 *
 * Everything here is vendor-scoped in the repository: a shopper on Aheed's host
 * exports and erases Aheed's data, and their account at another store is
 * untouched. The one exception is the display name, which belongs to the shared
 * identity and so applies everywhere.
 */
export default async function AccountDataPage() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as { id: string; name: string; email: string };
  const repo = getDataRightsRepository();
  const [providers, isStaff] = await Promise.all([
    repo.getAccountProviders(user.id),
    repo.hasVendorMembership(user.id),
  ]);

  return (
    <main className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Your data</h1>

      <section className="mb-6 rounded-md border border-black/10 bg-surface-muted p-5">
        <h2 className="mb-2 text-lg font-semibold text-primary">Download your data</h2>
        <p className="mb-4 text-sm text-primary/80">
          A JSON file containing everything this store holds about you — your account details,
          orders, addresses, reviews, basket, loyalty points and any discount codes you have used.
        </p>
        <Link
          href="/account/data/export"
          prefetch={false}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download
        </Link>
      </section>

      <section className="mb-6 rounded-md border border-black/10 bg-surface-muted p-5">
        <h2 className="mb-2 text-lg font-semibold text-primary">Correct your details</h2>
        <p className="mb-4 text-sm text-primary/80">
          Your email address can&apos;t be changed here yet. Contact us if it needs correcting.
        </p>
        <NameForm currentName={user.name} />
      </section>

      <section className="mb-6 rounded-md border border-danger/30 bg-surface-muted p-5">
        <h2 className="mb-2 text-lg font-semibold text-primary">Erase your data</h2>
        <p className="mb-2 text-sm text-primary/80">
          This removes your name, contact details, addresses, reviews, basket and loyalty points
          from this store. It cannot be undone.
        </p>
        <p className="mb-4 text-sm text-primary/80">
          Your past orders are kept as anonymised records, with your name and address removed — we
          are required to retain proof of sale for six years, and those records will no longer
          identify you.
        </p>
        <EraseDataForm
          mode={eraseConfirmationMode(providers)}
          accountEmail={user.email}
          blockedReason={
            isStaff
              ? "Staff and admin accounts can't be erased from here — ask another admin to remove your role first."
              : null
          }
        />
      </section>

      <Link href="/account" className="text-sm font-medium text-primary underline">
        Back to your account
      </Link>
    </main>
  );
}
