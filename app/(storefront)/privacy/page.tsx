import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { CookieSettingsButton } from "@/components/consent/CookieSettingsButton";
import {
  ASSISTANT_CONVERSATION_RETENTION_DAYS,
  ATTEMPT_RECORD_RETENTION_HOURS,
  SEARCH_QUERY_LOG_RETENTION_DAYS,
} from "@/lib/data-retention";
import {
  CART_COOKIE,
  CHECKOUT_DETAILS_KEY,
  CONSENT_COOKIE,
  REFERRAL_COOKIE,
} from "@/lib/storage-keys";

export const dynamic = "force-dynamic";

/** #1041 — "one hour" reads better than "1 hours" in a policy; any other count is numeric. */
function hoursPhrase(hours: number): string {
  return hours === 1 ? "one hour" : `${hours} hours`;
}

export async function generateMetadata(): Promise<Metadata> {
  const profile = await getCurrentVendorProfile();
  const vendorName = profile?.name ?? "Aheed Food Centre";
  return {
    title: `Privacy Policy — ${vendorName}`,
    description: `UK GDPR and PECR privacy policy explaining how ${vendorName} protects your personal data.`,
  };
}

export default async function PrivacyPage() {
  const profile = await getCurrentVendorProfile();
  const vendorName = profile?.name ?? "Aheed Food Centre";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-primary">
      <nav className="mb-6 text-xs text-primary-muted">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        / <span className="text-primary font-medium">Privacy Policy</span>
      </nav>

      <article className="prose prose-sm max-w-none space-y-6">
        <header className="border-b border-black/10 pb-4">
          <h1 className="text-2xl font-bold tracking-tight">{vendorName} — Privacy Policy</h1>
          <p className="text-xs text-primary-muted mt-1">Last updated: August 18, 2026</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">1. UK GDPR Compliance</h2>
          <p className="text-sm text-primary-muted leading-relaxed">
            {vendorName} is committed to protecting your personal data in accordance with the UK
            General Data Protection Regulation (UK GDPR) and the Privacy and Electronic
            Communications Regulations (PECR).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">2. Information We Collect</h2>
          <p className="text-sm text-primary-muted leading-relaxed">
            We collect personal information necessary to process your orders, including your name,
            email address, delivery address, phone number, and transaction history.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">3. How We Use Your Data</h2>
          <p className="text-sm text-primary-muted leading-relaxed">
            Your data is used solely to process payments (via Stripe), fulfil and deliver your
            orders, and send order confirmations and updates. We do not sell your personal data to
            third parties.
          </p>
        </section>

        {/* #1055 — the footer's "Cookies" link lands here. */}
        <section id="cookies" className="scroll-mt-24 space-y-2">
          <h2 className="text-lg font-semibold text-primary">4. Cookies and Local Storage</h2>
          <p className="text-sm text-primary-muted leading-relaxed">
            We use cookies and local storage technologies to support essential website
            functionality, including user authentication, shopping cart management, delivery and
            collection preferences, checkout convenience, and the storage of cookie consent
            preferences. One optional cookie remembers a referral code, and it is set only if you
            choose Accept All.
          </p>
          <p className="text-sm text-primary-muted leading-relaxed">
            The following cookies and local storage items are used for these purposes:
          </p>
          {/* #1064 — every name here is one the storefront really sets; tests/privacy-cookies-
              section.test.tsx pins the three that exist as exported constants. The session name is
              Better Auth's own, with the `__Secure-` prefix it adds over HTTPS.

              #1089 — PURPOSE FIRST, name second, and no `<code>`. The owner's user-testing pass
              read the previous name-led, code-styled version as "code base words". The names stay,
              every one of them: naming the cookie is the transparency a shopper is owed under PECR
              and the UK GDPR, so dropping them would trade one defect for another. They are
              presented as what they are — an identifier you would see in your browser — rather
              than as the heading of each entry.

              #1080 — the four names the storefront owns render from `lib/storage-keys.ts`, so a
              rename cannot leave this list wrong, and only the current names are listed: naming
              the pre-#1080 ones would put another vendor's name back on this page. #1065 — the
              referral cookie is optional, written only after Accept All. */}
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-primary-muted leading-relaxed">
            <li>
              Keeps you signed in.{" "}
              <span>
                Shown in your browser as{" "}
                <span className="font-semibold">__Secure-better-auth.session_token</span>.
              </span>
            </li>
            <li>
              Keeps the items in your basket.{" "}
              <span>
                Shown in your browser as <span className="font-semibold">{CART_COOKIE}</span>.
              </span>
            </li>
            <li>
              Remembers your cookie choices.{" "}
              <span>
                Shown in your browser as <span className="font-semibold">{CONSENT_COOKIE}</span>.
              </span>
            </li>
            <li>
              Remembers the postcode you entered, so we can show delivery availability and fees.{" "}
              <span>
                Shown in your browser as <span className="font-semibold">delivery-postcode</span>.
              </span>
            </li>
            <li>
              Remembers whether you chose delivery or collection.{" "}
              <span>
                Shown in your browser as <span className="font-semibold">fulfilment-method</span>.
              </span>
            </li>
            <li>
              Remembers a referral code from a link you followed, so it can be applied at checkout.
              Optional: set only if you arrive through a referral link and choose Accept All.{" "}
              <span>
                Shown in your browser as <span className="font-semibold">{REFERRAL_COOKIE}</span>.
              </span>
            </li>
            <li>
              Keeps the contact and delivery details you type at checkout, so they are filled in
              next time. Stored on your device, not on our servers.{" "}
              <span>
                Shown in your browser as{" "}
                <span className="font-semibold">{CHECKOUT_DETAILS_KEY}</span>.
              </span>
            </li>
          </ul>
          <p className="text-sm text-primary-muted leading-relaxed">
            These cookies and local storage items are scoped to the relevant host. All of them
            except the referral cookie are used to provide core website functionality.
          </p>
          {/* #1107 — reopens the consent banner; the same control sits in the footer. */}
          <p className="text-sm text-primary-muted leading-relaxed">
            You can change your choice at any time.
          </p>
          <CookieSettingsButton className="text-sm font-medium text-primary underline underline-offset-2 hover:text-primary-muted" />
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">5. How Long We Keep Your Data</h2>
          <p className="text-sm text-primary-muted leading-relaxed">
            We keep records of completed orders for <strong>six years</strong>, which is the
            retention period UK tax law requires for proof of sale. Your account details, saved
            addresses, reviews, feedback, basket and loyalty points are kept for as long as you have
            an account with us, and are removed when you ask us to erase your data.
          </p>
          {/* P9.2 (#818) — feedback is the only thing a customer writes here that we publish
              to strangers, so what appears alongside it is stated plainly rather than left to
              be discovered after the fact. */}
          <p className="text-sm text-primary-muted leading-relaxed">
            <strong>Feedback you leave about the shop.</strong> If you send us feedback, a member of
            our team reads it before it appears anywhere. If we publish it, we show your{" "}
            <strong>first name, the initial of your surname</strong> and your star rating alongside
            what you wrote — never your full name, your email address or anything about your orders.
            You can change or replace your feedback at any time, and erasing your data removes it
            entirely. We also keep a scrambled (hashed) form of your network address with your
            feedback, used only to investigate abuse, and it is removed with your feedback.
          </p>
          {/* #1014 — the help assistant's log. Not personal data by design (no user link), but a
              shopper is still entitled to know it exists and how long it lasts. */}
          <p className="text-sm text-primary-muted leading-relaxed">
            <strong>The help assistant.</strong> If a store offers a help assistant and you use it,
            we record the topic you chose and whether it was answered or passed to the store on
            WhatsApp, together with a scrambled (hashed) form of your network address so the
            assistant cannot be flooded. This record is not linked to your name or your account. It
            becomes due for deletion after {ASSISTANT_CONVERSATION_RETENTION_DAYS} days and is
            removed by routine clean-up after that.
          </p>
          {/* #1041 — every record holding a hashed network address is disclosed here, with its
              retention rendered from lib/data-retention.ts so the policy and the sweeps cannot
              disagree. "Due for deletion", not "deleted after": each sweep runs on a small random
              fraction of writes, so a row on a quiet shop can outlive its figure. */}
          <p className="text-sm text-primary-muted leading-relaxed">
            <strong>Searches.</strong> When you search the shop, we record what you searched for and
            how many results it found, together with a scrambled (hashed) form of your network
            address, so the shop can see what shoppers look for and cannot find. This record is not
            linked to your name or your account. It becomes due for deletion after{" "}
            {SEARCH_QUERY_LOG_RETENTION_DAYS} days and is removed by routine clean-up after that.
          </p>
          <p className="text-sm text-primary-muted leading-relaxed">
            <strong>Records that protect the shop from abuse.</strong> When you sign in, create an
            account or reset a password, look up an order, enter a discount code we do not
            recognise, send feedback, or paste a shopping list for the shop to match, we briefly
            record that it happened, together with a scrambled (hashed) form of your network
            address, so that repeated attempts can be slowed down. These records are not linked to
            your name or your account. Each becomes due for deletion after{" "}
            {hoursPhrase(ATTEMPT_RECORD_RETENTION_HOURS)} and is removed by routine clean-up after
            that.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-primary">6. Your Data Rights</h2>
          <p className="text-sm text-primary-muted leading-relaxed">
            Under UK GDPR you have the right to access, rectify and request deletion of your
            personal data. If you have an account with us, you can exercise all three yourself from{" "}
            <Link href="/account/data" className="font-medium underline">
              your data
            </Link>{" "}
            in your account — download everything we hold about you, correct your name, or erase
            your data without needing to contact anyone.
          </p>
          <p className="text-sm text-primary-muted leading-relaxed">
            <strong>What erasure does.</strong> We remove your name, contact details, addresses,
            reviews, any feedback you left about the shop, basket and loyalty points. We{" "}
            <em>keep</em> your past orders, because we are required to retain proof of sale — but we
            strip your name and address from them first, so the records that remain no longer
            identify you. If you do not shop with any of our other stores, your sign-in is deleted
            too.
          </p>
          <p className="text-sm text-primary-muted leading-relaxed">
            <strong>If you checked out as a guest.</strong> You do not need an account to exercise
            these rights. Look your order up at{" "}
            <Link href="/orders/lookup" className="font-medium underline">
              track your order
            </Link>{" "}
            using the order number and the email address you gave at checkout — that shows you
            everything we hold about the order, and lets you erase the personal details on it. We
            ask for both the order number and the email because either one on its own is not proof
            the order is yours; households often share a mailbox.
          </p>
          <p className="text-sm text-primary-muted leading-relaxed">
            Guest erasure covers <strong>one order per request</strong>. If you placed several
            orders as a guest, look each one up and erase it the same way. As above, the order
            itself is kept as an anonymised financial record with your name, address and phone
            number removed.
          </p>
          <p className="text-sm text-primary-muted leading-relaxed">
            Each of our stores holds its own records, so erasing your data here does not affect an
            account you hold with another store on this platform. Payments are processed by Stripe,
            which keeps its own transaction records under its own privacy policy; erasing your data
            here does not remove them.
          </p>
        </section>
      </article>
    </main>
  );
}
