import Link from "next/link";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getCustomerFeedbackRepository } from "@/lib/customer-feedback-service";
import { getVendorReviewLinkRepository } from "@/lib/vendor-review-links-service";
import { FeedbackForm } from "@/components/storefront/FeedbackForm";
import { ReviewLinkGroup } from "@/components/storefront/CustomerFeedbackCards";
import { AccountNav } from "@/components/account/AccountNav";

/**
 * Where a customer leaves feedback about the shop (P9.2, #818).
 *
 * SIGNED-IN ONLY, BUT NO PURCHASE REQUIRED. A completed order earns the "Verified customer"
 * badge and nothing else — it is not a gate. The signed-out branch renders a prompt rather
 * than the form, and `submitFeedback` re-checks the session itself, because a hidden form is
 * not an access control.
 *
 * `force-dynamic` because the page is per-session: it shows this customer their own
 * submission and its moderation state.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Share your feedback",
};

const STATUS_COPY: Record<string, string> = {
  PENDING: "Your feedback is waiting to be checked and isn't shown on the site yet.",
  APPROVED: "Your feedback is live on our homepage. Thank you!",
  REJECTED: "Your feedback wasn't published. You can edit it and send it again.",
};

export default async function FeedbackPage() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });

  if (!session?.user) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold text-primary">Share your feedback</h1>
        <p className="mt-3 text-sm text-primary-muted">
          Please sign in to leave feedback about your experience with us.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          Sign in
        </Link>
        <ExternalInvite />
      </main>
    );
  }

  const existing = await getCustomerFeedbackRepository().getOwn(session.user.id);

  return (
    <>
      <AccountNav />
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold text-primary">Share your feedback</h1>
        <p className="mt-2 text-sm text-primary-muted">
          Tell us how we did. Every review is read by our team before it appears on the site.
        </p>

        {existing && (
          <p
            role="status"
            className="mt-5 rounded-lg border border-black/10 bg-surface-muted px-4 py-3 text-sm text-primary"
          >
            {STATUS_COPY[existing.status] ?? ""} Editing it below replaces what you sent before and
            sends it back to us to check.
          </p>
        )}

        <div className="mt-6">
          <FeedbackForm existing={existing} />
        </div>

        <ExternalInvite />
      </main>
    </>
  );
}

/**
 * Outbound review links, offered here as well as on the landing page — a customer who came
 * to leave feedback is exactly the person willing to leave it elsewhere too. Renders nothing
 * when the vendor has configured none.
 */
async function ExternalInvite() {
  const reviewLinks = await getVendorReviewLinkRepository().listActive();
  if (reviewLinks.length === 0) return null;

  return (
    <div className="mt-10 border-t border-black/10 pt-6">
      <ReviewLinkGroup reviewLinks={reviewLinks} />
    </div>
  );
}
