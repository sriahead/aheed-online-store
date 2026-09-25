/**
 * #900 — the review form's state, in a PLAIN module. `features/admin/net-content-suggestions.ts`
 * is a "use server" file and may export only async functions (CLAUDE.md: a single exported
 * constant there makes every action in the file 500 at runtime while every check stays green).
 */
export interface NetContentReviewState {
  error: string | null;
  notice: string | null;
}

export const initialNetContentReviewState: NetContentReviewState = { error: null, notice: null };
