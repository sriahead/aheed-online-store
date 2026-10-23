import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDataRightsRepository } from "@/lib/data-rights-service";
import {
  dataErasureItems,
  dataExportItems,
  eraseConfirmationMode,
  listPhrase,
} from "@/lib/data-rights-form";
import { NameForm } from "@/components/account/NameForm";
import { EraseDataForm } from "@/components/account/EraseDataForm";
import { MarketingConsentForm } from "@/components/account/MarketingConsentForm";
import { getMarketingConsentRepository } from "@/lib/marketing-consent-service";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { PageContainer } from "@/components/layout/PageContainer";
import { Icon } from "@/components/icons/Icon";

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
  const [providers, isStaff, profile, marketing] = await Promise.all([
    repo.getAccountProviders(user.id),
    repo.hasVendorMembership(user.id),
    getCurrentVendorProfile(),
    getMarketingConsentRepository().forUser(user.id),
  ]);
  // #1134 — loyalty is named only where the store runs it (export and erasure still cover any
  // points that exist). The marketing section shows where the store asks for consent, and also
  // wherever this shopper is currently opted in, so withdrawing never depends on the switch.
  const loyaltyEnabled = profile?.loyaltyEnabled ?? false;
  const marketingGranted = marketing.state?.granted === true;
  const showMarketing = marketing.statement !== null && (marketing.enabled || marketingGranted);
  const listFlags = { loyalty: loyaltyEnabled, marketing: showMarketing };

  return (
    <PageContainer width="standard">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Your data</h1>

      <section className="mb-6 rounded-2xl border border-black/10 bg-surface-muted p-5">
        <h2 className="mb-2 text-lg font-semibold text-primary">Download your data</h2>
        <p className="mb-4 text-sm text-primary-muted">
          A JSON file containing everything this store holds about you —{" "}
          {listPhrase(dataExportItems(listFlags))}.
        </p>
        <Link
          href="/account/data/export"
          prefetch={false}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 motion-reduce:active:scale-100"
        >
          <Icon name="download" className="h-4 w-4" />
          Download
        </Link>
      </section>

      <section className="mb-6 rounded-2xl border border-black/10 bg-surface-muted p-5">
        <h2 className="mb-2 text-lg font-semibold text-primary">Correct your details</h2>
        <p className="mb-4 text-sm text-primary-muted">
          Your email address can&apos;t be changed here yet. Contact us if it needs correcting.
        </p>
        <NameForm currentName={user.name} />
      </section>

      {showMarketing && marketing.statement !== null && (
        <section className="mb-6 rounded-2xl border border-black/10 bg-surface-muted p-5">
          <h2 className="mb-2 text-lg font-semibold text-primary">Marketing emails</h2>
          <MarketingConsentForm granted={marketingGranted} statement={marketing.statement} />
        </section>
      )}

      <section className="mb-6 rounded-2xl border border-danger/30 bg-surface-muted p-5">
        <h2 className="mb-2 text-lg font-semibold text-primary">Erase your data</h2>
        <p className="mb-2 text-sm text-primary-muted">
          This removes {listPhrase(dataErasureItems(listFlags))} from this store. It cannot be
          undone.
        </p>
        <p className="mb-4 text-sm text-primary-muted">
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
    </PageContainer>
  );
}
