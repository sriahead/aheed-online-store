import Link from "next/link";
import { Star, BadgeCheck, ExternalLink } from "lucide-react";
import { CardStack } from "@/components/ui/CardStack";
import type { PublicFeedback, FeedbackSummary } from "@/lib/repositories/customer-feedback";
import type { ReviewLink } from "@/lib/repositories/vendor-review-links";

/**
 * The storefront's business-level social proof (P9.2, #818).
 *
 * A SERVER COMPONENT. The rows arrive from the page's own query set and are rendered into
 * the markup here, so the cards are in the server-rendered HTML and the section costs one
 * indexed read and no client fetch (R45). Only `CardStack` crosses the client boundary, and
 * it receives finished markup as children.
 *
 * FEEDBACK IS FIRST-PARTY, ALWAYS. Nothing on this page is fetched from Google, Trustpilot
 * or any other platform. The links at the bottom are outbound only — an invitation to review
 * the shop elsewhere, never a window onto content from elsewhere. See
 * `specs/2026-09-19-p818-customer-feedback-reviews/plan.md`.
 *
 * NULL HIDES THE ELEMENT (#239). No approved feedback renders no section at all — not a
 * heading, not an empty container, not a placeholder. A shop with nothing to show says
 * nothing, rather than showing an empty frame that reads as broken.
 *
 * THE COMMENT IS RENDERED AS TEXT, never as markdown or HTML. Other surfaces in this repo
 * use `react-markdown`; this one deliberately does not, because this is the only text in the
 * application written by a member of the public. JSX escapes it by construction — do not
 * "improve" this into `dangerouslySetInnerHTML` or a markdown renderer.
 */

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={
            value <= rating
              ? "h-4 w-4 fill-amber-400 text-amber-400"
              : "h-4 w-4 text-primary-subtle"
          }
          aria-hidden
        />
      ))}
    </div>
  );
}

/**
 * "3 days ago", "last month". Intl rather than a date library — no dependency, and the
 * storefront already runs on the vendor's own locale conventions.
 */
function relativeDate(value: Date, now: Date): string {
  const formatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  const diffDays = Math.round((value.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (Math.abs(diffDays) < 1) return "today";
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, "day");
  if (Math.abs(diffDays) < 365) return formatter.format(Math.round(diffDays / 30), "month");
  return formatter.format(Math.round(diffDays / 365), "year");
}

export function CustomerFeedbackCards({
  feedback,
  summary,
  reviewLinks,
  now = new Date(),
}: {
  feedback: PublicFeedback[];
  summary: FeedbackSummary;
  reviewLinks: ReviewLink[];
  /** Injected so the relative dates are deterministic in a test. */
  now?: Date;
}) {
  if (feedback.length === 0) return null;

  return (
    <section
      aria-labelledby="customer-feedback-heading"
      className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm md:p-8"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="customer-feedback-heading" className="text-xl font-bold text-primary md:text-2xl">
            What our customers say
          </h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-primary-muted">
            <Stars rating={Math.round(summary.averageRating)} />
            <span className="font-semibold text-primary">{summary.averageRating.toFixed(1)}</span>
            <span>
              from {summary.approvedCount} {summary.approvedCount === 1 ? "review" : "reviews"}
            </span>
          </p>
        </div>

        <Link
          href="/feedback"
          className="rounded-lg border border-primary/20 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          Share your experience
        </Link>
      </div>

      <CardStack itemLabel="customer feedback">
        {feedback.map((entry) => (
          <article
            key={entry.id}
            className="flex h-full flex-col gap-3 rounded-2xl border border-black/10 bg-surface-muted p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <Stars rating={entry.rating} />
              {entry.verifiedPurchase && (
                <span className="inline-flex items-center gap-1 rounded-full bg-action-tint px-2 py-0.5 text-xs font-semibold text-action">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  Verified customer
                </span>
              )}
            </div>

            <p className="flex-1 text-sm leading-relaxed text-primary">{entry.comment}</p>

            <p className="text-xs font-medium text-primary-muted">
              {entry.authorName} · {relativeDate(entry.submittedAt, now)}
            </p>
          </article>
        ))}
      </CardStack>

      <ReviewLinkGroup reviewLinks={reviewLinks} bordered />
    </section>
  );
}

/**
 * Outbound "review us elsewhere" links.
 *
 * ITS OWN COMPONENT, RENDERED INDEPENDENTLY OF THE CARDS, and that is a correctness point
 * rather than tidiness. The feedback section disappears entirely when there is no approved
 * feedback (R36), and at launch there will be none — the platform has never traded. If the
 * links lived only inside that section they would disappear with it, exactly when they are
 * the only social proof available. #818's plan says the links carry the load meanwhile, so
 * they cannot be a child of the thing that is empty.
 *
 * `bordered` is the only difference between the two placements: a divider makes sense under
 * the cards and looks like a stray rule without them.
 */
export function ReviewLinkGroup({
  reviewLinks,
  bordered = false,
}: {
  reviewLinks: ReviewLink[];
  bordered?: boolean;
}) {
  if (reviewLinks.length === 0) return null;

  return (
    <div className={bordered ? "mt-8 border-t border-black/10 pt-5" : ""}>
      <h3 className="text-sm font-semibold text-primary">Review us elsewhere</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {reviewLinks.map((link) => (
          <li key={link.id}>
            <a
              href={link.url}
              target="_blank"
              // noopener is the security half (the opened page cannot reach window.opener);
              // noreferrer stops the storefront URL leaking as a referrer to a third party
              // we do not control.
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              {link.platform}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
