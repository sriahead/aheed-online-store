"use client";

import { useActionState } from "react";
import { StarRatingInput } from "@/components/product/StarRatingInput";
import { submitFeedback } from "@/features/feedback/submit-feedback";
import {
  MAX_COMMENT_LENGTH,
  initialFeedbackState,
  type FeedbackFormState,
} from "@/features/feedback/validate-feedback";

/**
 * The customer's own feedback form (P9.2, #818).
 *
 * A client component only because `useActionState` renders the returned error without a
 * navigation. The action itself is a Server Action behind a plain `<form>`, so the form
 * still submits and still works with JavaScript disabled — the same progressive-enhancement
 * shape as `features/reviews/submit-review.ts`'s form.
 *
 * The rating is an interactive star-rating input backed by accessible radio inputs under the
 * hood for keyboard navigation and screen-reader support (reusing `StarRatingInput`).
 *
 * `existing` pre-fills the form when the customer has left feedback before. Saving replaces
 * it and sends it back to the moderation queue, which the copy below states plainly —
 * a customer who edits an approved review should not be surprised that it disappears.
 */
export function FeedbackForm({
  existing,
}: {
  existing: { rating: number; comment: string | null; status: string } | null;
}) {
  const [state, formAction, pending] = useActionState<FeedbackFormState, FormData>(
    submitFeedback,
    initialFeedbackState,
  );

  return (
    <form action={formAction} className="space-y-6">
      <StarRatingInput
        key={existing?.rating ?? "new"}
        name="rating"
        defaultValue={existing?.rating ?? null}
        label="Your rating"
        labelClassName="text-sm font-semibold text-primary"
        required
      />

      <div>
        <label htmlFor="feedback-comment" className="text-sm font-semibold text-primary">
          Your feedback
        </label>
        <textarea
          id="feedback-comment"
          name="comment"
          rows={5}
          required
          maxLength={MAX_COMMENT_LENGTH}
          defaultValue={existing?.comment ?? ""}
          placeholder="How was your experience shopping with us?"
          className="mt-2 w-full rounded-lg border border-black/10 bg-white p-3 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-action focus:ring-offset-2"
        />
        <p className="mt-1 text-xs text-primary-muted">
          Up to {MAX_COMMENT_LENGTH} characters. Your first name and the initial of your surname
          will be shown with your rating.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      {state.success && (
        <p role="status" className="rounded-lg bg-action-tint px-3 py-2 text-sm text-action">
          Thanks — your feedback has been sent for review and will appear once it&apos;s been
          checked.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
      >
        {pending ? "Sending…" : existing ? "Update my feedback" : "Send feedback"}
      </button>
    </form>
  );
}
