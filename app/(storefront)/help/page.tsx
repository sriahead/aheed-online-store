import { Metadata } from "next";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getVendorFaqRepository } from "@/lib/vendor-faqs-service";
import { PageContainer } from "@/components/layout/PageContainer";
import Link from "next/link";
import { HelpContactCard } from "@/components/assistant/HelpContactCard";
import { Icon } from "@/components/icons/Icon";
import { RoleJourneyMaps, type UserJourneyRole } from "@/components/help/RoleJourneyMaps";

export const metadata: Metadata = {
  title: "Help Centre",
};

/**
 * The shopper & multi-role Help Centre (#1013, #1012, #1385).
 *
 * User journeys are presented through interactive role maps (Shopper, Staff, Store Admin, Platform Admin).
 * Store-specific answers come from `/staff/faqs` (#1012). No answer is hardcoded; a vendor with none gets
 * no questions section (#239).
 */
export default async function HelpPage() {
  const [auth, profile, faqs] = await Promise.all([
    requireVendorRole("STAFF", "ADMIN"),
    getCurrentVendorProfile(),
    getVendorFaqRepository().listActive(),
  ]);
  const isStaff = auth.ok;

  let detectedRole: UserJourneyRole = "customer";
  if (auth.ok) {
    if (auth.via === "platform-admin") {
      detectedRole = "platform-admin";
    } else if (auth.via === "ADMIN") {
      detectedRole = "store-admin";
    } else if (auth.via === "STAFF") {
      detectedRole = "staff";
    }
  }

  return (
    <PageContainer width="narrow" className="space-y-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-black/90">Help Centre</h1>
        <p className="text-black/60">
          Everything you need to know about shopping, delivery, platform features, and your data.
        </p>
      </header>

      {/* #1385 — Interactive role-based user journey maps with delivery anchor */}
      <div id="delivery" className="scroll-mt-24">
        <RoleJourneyMaps detectedRole={detectedRole} />
      </div>

      {isStaff && (
        <section className="bg-primary/5 rounded-2xl p-6 sm:p-8 border border-primary/20">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Icon name="shield-alert" className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-primary">Internal Staff Resources</h2>
              <p className="text-sm text-black/70 mt-1">
                You are authenticated as store staff. The operational runbook and administrative
                tools are available in the Staff Panel.
              </p>
              <div className="mt-4 p-4 bg-white rounded-xl border border-primary/10">
                <h3 className="font-bold text-sm mb-2">How to access the Staff Panel:</h3>
                <ol className="list-decimal list-inside text-sm text-black/70 space-y-2">
                  <li>
                    Click the <strong>View Switcher</strong> in the top right of the header
                    (currently says &quot;Shopper View&quot;).
                  </li>
                  <li>
                    Select <strong>Staff View</strong> (or Admin View if available).
                  </li>
                  <li>
                    Use the navigation tabs to access Orders, Live Inventory, and the{" "}
                    <Link href="/staff/runbook" className="font-bold text-primary hover:underline">
                      Operational Runbook
                    </Link>
                    .
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* #1052 — the help assistant when it is on, else the store's WhatsApp, else nothing. Same
          availability rule as `FloatingContact` in `StorefrontChrome`. */}
      {profile && (
        <HelpContactCard
          vendorName={profile.name}
          whatsappNumber={profile.whatsappNumber}
          assistantAvailable={profile.assistantEnabled && profile.whatsappNumber !== null}
        />
      )}

      {/* #1012 — the vendor's own answers. Nothing is authored by the platform, so a store with no
          active rows gets no section here rather than an empty heading. */}
      {faqs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Icon name="circle-question-mark" className="w-5 h-5 text-action-tint" />
            <h2 className="text-2xl font-bold">Questions we are asked</h2>
          </div>
          <dl className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.id} className="bg-white rounded-2xl p-6 border border-black/10">
                <dt className="font-bold text-black/90">{faq.question}</dt>
                <dd className="mt-2 whitespace-pre-line text-sm text-black/70">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </PageContainer>
  );
}
