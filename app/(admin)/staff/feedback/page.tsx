import { redirect } from "next/navigation";
import { Star, BadgeCheck } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getCustomerFeedbackRepository } from "@/lib/customer-feedback-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { moderateFeedback, approveFeedbackBulk } from "@/features/admin/feedback";

/**
 * Customer feedback moderation (P9.2, #818).
 *
 * NOTHING A CUSTOMER WRITES IS PUBLIC UNTIL A ROW IS APPROVED HERE. This page is the only
 * control over that, which is why it exists before the storefront section does anything.
 *
 * WHAT THIS PAGE CANNOT DO, DELIBERATELY. There is no "add feedback" control and no way to
 * edit a customer's rating, comment or name. Staff approve, reject, un-approve and annotate
 * internally. Writing or editing a customer's words would be fabricating a review, and the
 * repository exposes no function that could do it — so this is enforced a layer below the
 * UI, not by the absence of a button.
 *
 * THE MODERATION STANDARD IS NOT SENTIMENT. A one-star review is real feedback and belongs
 * on the site. Reject spam, abuse, personal data and irrelevance. Approving only flattering
 * feedback turns the storefront section into a misrepresentation — stated here because this
 * page is where the temptation lives.
 *
 * STAFF and ADMIN both: moderating the queue is day-to-day shop operations, which #737
 * scoped to STAFF.
 */
export const dynamic = "force-dynamic";

/** Enough to work a queue in one sitting without an unbounded read. */
const MODERATION_PAGE_SIZE = 100;

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-accent-tint text-accent",
  APPROVED: "bg-action-tint text-action",
  REJECTED: "bg-danger-tint text-danger",
};

export default async function StaffFeedbackPage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    // Never `return null` here: app/(admin)/layout.tsx renders the portal shell around
    // whatever this returns, so a bare null serves 200 with the header, the nav and an
    // empty page — indistinguishable from a loading state rather than a refusal. Every
    // other /staff/* page uses PanelRefusal (CLAUDE.md, #350).
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Staff only"
        message="You're signed in, but your account doesn't have permission to moderate this store's customer feedback."
      />
    );
  }

  const feedback = await getCustomerFeedbackRepository().listForModeration(MODERATION_PAGE_SIZE);
  const pending = feedback.filter((entry) => entry.status === "PENDING");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-primary">Customer feedback</h1>
        <p className="mt-2 text-sm text-primary-muted">
          Feedback customers have left about the shop. Nothing appears on the storefront until you
          approve it. Reject spam, abuse, anything containing personal details, and anything
          unrelated — but a low rating on its own is honest feedback and belongs on the site.
        </p>
      </header>

      {feedback.length === 0 ? (
        <p className="rounded-2xl border border-black/10 bg-white p-6 text-sm text-primary-muted">
          No customer feedback yet. When someone leaves feedback it will appear here for you to
          check.
        </p>
      ) : (
        <>
          {pending.length > 1 && (
            <form action={approveFeedbackBulk} className="mb-6">
              {pending.map((entry) => (
                <input key={entry.id} type="hidden" name="feedbackId" value={entry.id} />
              ))}
              <button
                type="submit"
                className="rounded-lg border border-action/30 bg-action-tint px-4 py-2 text-sm font-semibold text-action transition-colors hover:bg-action-tint/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
              >
                Approve all {pending.length} waiting
              </button>
            </form>
          )}

          <ul className="space-y-4">
            {feedback.map((entry) => (
              <li
                key={entry.id}
                className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5" aria-label={`${entry.rating} of 5`}>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <Star
                          key={value}
                          className={
                            value <= entry.rating
                              ? "h-4 w-4 fill-amber-400 text-amber-400"
                              : "h-4 w-4 text-primary-subtle"
                          }
                          aria-hidden
                        />
                      ))}
                    </span>
                    <span className="text-sm font-semibold text-primary">{entry.authorName}</span>
                    {entry.verifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-action">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                        Verified customer
                      </span>
                    )}
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[entry.status] ?? ""}`}
                  >
                    {entry.status}
                  </span>
                </div>

                {/* Plain text. Never markdown, never dangerouslySetInnerHTML — this is the
                    only text in the application written by a member of the public. */}
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-primary">
                  {entry.comment}
                </p>

                <p className="mt-2 text-xs text-primary-muted">
                  Submitted {entry.submittedAt.toLocaleString("en-GB")}
                  {entry.moderatedAt &&
                    ` · last moderated ${entry.moderatedAt.toLocaleString("en-GB")}`}
                </p>

                <form action={moderateFeedback} className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="feedbackId" value={entry.id} />

                  <div className="min-w-[14rem] flex-1">
                    <label
                      htmlFor={`note-${entry.id}`}
                      className="text-xs font-semibold text-primary"
                    >
                      Internal note (never shown to customers)
                    </label>
                    <input
                      id={`note-${entry.id}`}
                      name="moderationNote"
                      type="text"
                      defaultValue={entry.moderationNote ?? ""}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-action focus:ring-offset-2"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {entry.status !== "APPROVED" && (
                      <button
                        type="submit"
                        name="intent"
                        value="approve"
                        className="rounded-lg bg-action px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                      >
                        Approve
                      </button>
                    )}
                    {entry.status === "APPROVED" && (
                      <button
                        type="submit"
                        name="intent"
                        value="unapprove"
                        className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                      >
                        Un-approve
                      </button>
                    )}
                    {entry.status !== "REJECTED" && (
                      <button
                        type="submit"
                        name="intent"
                        value="reject"
                        className="rounded-lg border border-danger/30 bg-white px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
