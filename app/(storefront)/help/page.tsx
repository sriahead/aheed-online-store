import { Metadata } from "next";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getLoyaltyRepository } from "@/lib/loyalty-service";
import { getVendorFaqRepository } from "@/lib/vendor-faqs-service";
import { helpDeliveryFacts, freeDeliveryOffered } from "@/lib/help-facts";
import { formatPrice } from "@/components/product/format-price";
import Link from "next/link";
import {
  ShieldAlert,
  MapPin,
  Sparkles,
  TicketPercent,
  Lock,
  HelpCircle,
  Store,
} from "lucide-react";
import { DocumentSectionRenderer } from "@/components/ui/DocumentSectionRenderer";
import { DOC_ARTICLES } from "../../(admin)/staff/runbook/docs";

export const metadata: Metadata = {
  title: "Help Centre",
};

/**
 * The shopper Help Centre (#1013, #1012).
 *
 * EVERY DELIVERY, COLLECTION AND LOYALTY FACT ON THIS PAGE IS COMPUTED, never written here. Until
 * #1013 this page asserted "A minimum order value is required for delivery" and "Every purchase
 * earns you points automatically" as platform prose. `minimumOrderPence` defaults to `0` and
 * `loyaltyEnabled` defaults to `false`, so both were false for some tenant — and the loyalty
 * promise was live in production on SriMart, a store with loyalty switched off. Every other
 * loyalty surface already gated on the flag (`/account/loyalty` 404s, `/account` and `/checkout`
 * branch); this page was the one that did not.
 *
 * Money comes from `lib/help-facts.ts`, which resolves it through `resolveDeliveryRules` — the page
 * never reads the three vendor-wide money fields directly, because any `VendorDeliveryArea` row may
 * override them per area (#890).
 *
 * Everything the database cannot answer is the vendor's own words, from `/staff/faqs` (#1012). No
 * answer is authored here or seeded; a vendor with none gets no questions section (#239).
 */
export default async function HelpPage() {
  const loyaltyRepository = getLoyaltyRepository();
  const [auth, profile, loyalty, tiers, faqs] = await Promise.all([
    requireVendorRole("STAFF", "ADMIN"),
    getCurrentVendorProfile(),
    loyaltyRepository.config(),
    // Read so the tier explanation this page inherited from the shopping guide survives #1013's
    // gate instead of being dropped with it. `tiers()` already exists; nothing new is queried for
    // a vendor that has none, and the sentence is hidden when the list is empty.
    loyaltyRepository.tiers(),
    getVendorFaqRepository().listActive(),
  ]);
  const isStaff = auth.ok;
  const localityName = profile?.localityName.trim() ?? "";

  const facts = helpDeliveryFacts(
    {
      deliveryFeePence: profile?.deliveryFeePence ?? 0,
      minimumOrderPence: profile?.minimumOrderPence ?? 0,
      freeDeliveryThresholdPence: profile?.freeDeliveryThresholdPence ?? null,
    },
    profile?.deliveryAreas ?? [],
  );

  const prefixes = profile?.deliveryPrefixes ?? [];
  const offersCollection = profile?.offerCollection ?? false;
  const { defaults, varies } = facts;

  /*
   * VISIBILITY IS PART OF THE FILTER, not just audience.
   *
   * This filter used to test audience alone, and three articles match that: the public shopping
   * guide, `docs/operations-research/order-fulfilment-core.md`, and a KMS pilot spec plan — the
   * latter two both `visibility: internal`, because they list `shopper` among several audiences for
   * KMS routing rather than because they are written for shoppers. The internal operations document
   * sorts first, so `shopperDocs[0]` served IT on the public Help Centre of every vendor, complete
   * with `PENDING_PAYMENT`, "Known Trap" and slot-capacity internals, while the guide written for
   * shoppers was never shown at all. Confirmed live in production on both vendors, 2026-10-10.
   *
   * Filed as its own defect; this slice fixes the filter because #1013's "no loyalty wording when
   * loyalty is off" requirement cannot hold while an internal document discussing points renders
   * here unconditionally. `visibility` is the field that already distinguishes the two, and
   * `kms/schema` validates it on every article.
   */
  const shopperDocs = (DOC_ARTICLES as any[]).filter(
    (doc) =>
      doc.visibility === "public" &&
      doc.audience &&
      (doc.audience.includes("shopper") || doc.audience.includes("customer")),
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 space-y-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-black/90">Help Centre</h1>
        <p className="text-black/60">
          Everything you need to know about shopping, delivery, and your data.
        </p>
      </header>

      {isStaff && (
        <section className="bg-primary/5 rounded-2xl p-6 sm:p-8 border border-primary/20">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-primary" />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl p-6 border border-black/10">
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="w-5 h-5 text-action-tint" />
            <h2 className="font-bold text-lg">Delivery &amp; Minimums</h2>
          </div>
          <div className="space-y-3 text-sm text-black/70">
            <p>
              {/* #905 — the vendor's own locality, never a fixed town: this sentence used to name
                  one vendor's town on every storefront, including a Reading store's. */}
              <strong>Delivery Zones:</strong>{" "}
              {localityName
                ? `We currently deliver across ${localityName} and surrounding local areas.`
                : "We deliver to the postcode areas this store serves."}{" "}
              Eligibility is verified at checkout using your postcode.
            </p>

            {/* #239's null-hides rule: a vendor with no delivery areas gets no list, not an
                empty one and not a placeholder. */}
            {prefixes.length > 0 && (
              <p>
                <strong>Postcodes we deliver to:</strong> {prefixes.join(", ")}.
              </p>
            )}

            <p>
              <strong>Minimum Order:</strong>{" "}
              {varies.minimum
                ? "This depends on where you are — see the breakdown below."
                : defaults.minimumOrderPence > 0
                  ? `Orders must reach ${formatPrice(defaults.minimumOrderPence)} before you can check out.`
                  : "There is no minimum order — order as little as you like."}
            </p>

            <p>
              <strong>Delivery Fee:</strong>{" "}
              {varies.fee
                ? "This depends on where you are — see the breakdown below."
                : defaults.deliveryFeePence > 0
                  ? `${formatPrice(defaults.deliveryFeePence)} per delivery.`
                  : "Delivery is free."}
            </p>

            <p>
              <strong>Free Delivery:</strong>{" "}
              {varies.threshold
                ? "This depends on where you are — see the breakdown below."
                : freeDeliveryOffered(defaults.freeDeliveryThresholdPence)
                  ? `Your delivery fee is waived once your basket reaches ${formatPrice(
                      defaults.freeDeliveryThresholdPence as number,
                    )}.`
                  : "We do not currently offer free delivery on larger orders."}
            </p>

            {/* Per-area breakdown, shown only where a VendorDeliveryArea row actually overrides
                something. Printing one figure as universal while an area charges differently is
                the same class of false claim this slice removed. */}
            {(varies.fee || varies.minimum || varies.threshold) && facts.areas.length > 0 && (
              <div className="pt-1">
                <p className="font-semibold text-black/80">By postcode area:</p>
                <ul className="mt-1 space-y-1">
                  {facts.areas.map((area) => (
                    <li key={area.prefix}>
                      <strong>{area.prefix}:</strong>{" "}
                      {area.deliveryFeePence > 0
                        ? `${formatPrice(area.deliveryFeePence)} delivery`
                        : "free delivery"}
                      {area.minimumOrderPence > 0
                        ? `, ${formatPrice(area.minimumOrderPence)} minimum`
                        : ", no minimum"}
                      {freeDeliveryOffered(area.freeDeliveryThresholdPence)
                        ? `, free over ${formatPrice(area.freeDeliveryThresholdPence as number)}`
                        : ""}
                      .
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Collection exists only where the vendor offers it. Click & Collect shipped in #402 and
            this page never mentioned it at all until #1013. */}
        {offersCollection && (
          <section className="bg-white rounded-2xl p-6 border border-black/10">
            <div className="flex items-center gap-3 mb-4">
              <Store className="w-5 h-5 text-action-tint" />
              <h2 className="font-bold text-lg">Click &amp; Collect</h2>
            </div>
            <div className="space-y-3 text-sm text-black/70">
              <p>
                <strong>Collecting instead:</strong> You can choose to collect your order from the
                store at checkout rather than have it delivered. There is no delivery fee on a
                collection order.
              </p>
              <p>
                <strong>Minimum Order:</strong>{" "}
                {facts.collectionMinimumOrderPence > 0
                  ? `Collection orders must reach ${formatPrice(facts.collectionMinimumOrderPence)}.`
                  : "There is no minimum for collection orders."}
              </p>
            </div>
          </section>
        )}

        {/* The gate this slice exists for. loyaltyEnabled defaults to false, and every other
            loyalty surface already respected it — this page promised points to stores that do not
            run a loyalty scheme. Rates are the vendor's own, never literals. */}
        {loyalty.loyaltyEnabled && (
          <section className="bg-white rounded-2xl p-6 border border-black/10">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-lg">Loyalty Points</h2>
            </div>
            <div className="space-y-3 text-sm text-black/70">
              <p>
                <strong>Earning Points:</strong> You earn {loyalty.pointsPerPoundEarned}{" "}
                {loyalty.pointsPerPoundEarned === 1 ? "point" : "points"} for every £1 you spend.
                Points are credited once your order is confirmed by the store.
              </p>
              <p>
                <strong>Redeeming Points:</strong> {loyalty.minRedeemPoints} points are worth{" "}
                {formatPrice(loyalty.minRedeemPoints * loyalty.pencePerPointRedeemed)} off a future
                order. You can redeem once you have at least {loyalty.minRedeemPoints} points. The
                checkout total updates as you enter them, and tells you if this order can only take
                some of them.
              </p>
              {tiers.length > 0 && (
                <p>
                  <strong>Tiers:</strong> Spend more over a rolling {loyalty.tierWindowDays}-day
                  period and you move into a higher tier
                  {" ("}
                  {tiers.map((tier) => tier.name).join(", ")}
                  {"), "}
                  which earns points faster.
                </p>
              )}
              {loyalty.pointsExpiryMonths !== null && (
                <p>
                  <strong>Expiry:</strong> Points expire {loyalty.pointsExpiryMonths} months after
                  you earn them.
                </p>
              )}
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl p-6 border border-black/10">
          <div className="flex items-center gap-3 mb-4">
            <TicketPercent className="w-5 h-5 text-accent" />
            <h2 className="font-bold text-lg">Discount Codes</h2>
          </div>
          <div className="space-y-3 text-sm text-black/70">
            <p>
              <strong>How to use:</strong> Enter your promo code at checkout before payment.
            </p>
            <p>
              <strong>Limitations:</strong> Only one discount code can be used per order. Discount
              codes cannot be stacked
              {loyalty.loyaltyEnabled ? ", but they can be used alongside your earned points" : ""}.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl p-6 border border-black/10">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-5 h-5 text-black/60" />
            <h2 className="font-bold text-lg">Privacy &amp; Data Rights</h2>
          </div>
          <div className="space-y-3 text-sm text-black/70">
            <p>
              <strong>Data Portability:</strong> If you are an account holder, you can request a
              machine-readable export of your data from your Account Settings page.
            </p>
            <p>
              <strong>Right to Erasure:</strong> You can permanently delete your account and
              anonymize your historical order data via your Account Settings. Guest shoppers can
              also request erasure using their order details.
            </p>
          </div>
        </section>
      </div>

      {/* #1012 — the vendor's own answers. Nothing is authored by the platform, so a store with no
          active rows gets no section here rather than an empty heading. */}
      {faqs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-action-tint" />
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

      {shopperDocs.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold mb-6 px-4 sm:px-0">Detailed Shopping Guide</h2>
          <DocumentSectionRenderer content={shopperDocs[0].content} />
        </section>
      )}
    </div>
  );
}
