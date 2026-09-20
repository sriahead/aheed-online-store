/**
 * Pure, unit-tested validation for customer feedback (P9.2, #818).
 *
 * A PLAIN MODULE, NOT `"use server"`. A `"use server"` file may export only async functions
 * — not even a plain constant — and that is enforced at *runtime*, so breaking it leaves
 * `build`, `typecheck` and `test` green while every action in the file 500s for every
 * caller. `features/reviews/validate-rating.ts` exists for exactly this reason; this is its
 * sibling.
 *
 * `parseRating` is reused from that module rather than reimplemented — the 1-5 integer rule
 * is the same rule, and two copies of it would drift.
 */

/** Longest comment accepted, measured after trimming. Stated in #818's requirements (R20). */
export const MAX_COMMENT_LENGTH = 1000;

/**
 * The submit action's `useActionState` shape.
 *
 * Lives here rather than beside the action for the same reason the parsers do: no
 * `"use server"` file in this repository exports a type or a constant, and the rule that
 * forbids it is enforced at runtime only.
 */
export interface FeedbackFormState {
  error: string | null;
  success: boolean;
}

export const initialFeedbackState: FeedbackFormState = { error: null, success: false };

export type ParsedComment = { ok: true; value: string } | { ok: false; error: string };

/**
 * A feedback comment is required, trimmed, and capped.
 *
 * Empty-after-trim is a refusal rather than a silent null: unlike a product review, where
 * the rating alone is meaningful, a blank card in the stack says nothing to a reader and
 * still occupies a slot a real comment could have had.
 */
export function parseComment(raw: string): ParsedComment {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { ok: false, error: "Tell us a little about your experience." };
  }

  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      error: `Please keep your feedback to ${MAX_COMMENT_LENGTH} characters or fewer.`,
    };
  }

  return { ok: true, value: trimmed };
}

/**
 * The published author name: first name plus surname initial, e.g. "Sarah M.".
 *
 * Derived server-side from the account and STORED at submit, never re-derived at render — a
 * later account rename must not silently rewrite words already published under the old name
 * (#818 R22).
 *
 * Degrades rather than throwing, because an account name is free text: a single-word name
 * publishes as-is, and an empty one falls back to a neutral label rather than rendering an
 * empty byline.
 */
export function toDisplayAuthorName(accountName: string): string {
  const parts = accountName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "A customer";
  if (parts.length === 1) return parts[0];

  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}
