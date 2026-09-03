/**
 * Form state for `/staff/search-synonyms` (P2.6 slice 3, #566).
 *
 * Lives here rather than in `features/admin/search-synonyms.ts` because a `"use server"` file may
 * export ONLY async functions. A same-file value export — even a plain constant used purely to seed
 * `useActionState` — makes EVERY action in that module 500 for every caller, and none of
 * `next build`, `tsc --noEmit` or `vitest` catch it (CLAUDE.md's Server Actions section; first hit
 * in P6b1/#159, found only by a live write at Validate).
 */

export interface SynonymFormState {
  /** Why the last submission failed, or `null`. */
  error: string | null;
  /** Which field the error belongs to, for inline display. */
  field: "alias" | "canonical" | null;
  /** Confirmation of a successful action, or `null`. */
  notice: string | null;
}

export const initialSynonymFormState: SynonymFormState = {
  error: null,
  field: null,
  notice: null,
};
