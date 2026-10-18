"use client";

import { useActionState } from "react";
import Link from "next/link";
import { BookmarkPlus, CircleCheck, LogIn } from "lucide-react";
import { ListReview } from "@/components/cart/ListReview";
import { matchList } from "@/features/cart/match-list";
import { saveListFromMatch } from "@/features/lists/save-list-from-match";
import { EMPTY_MATCH_STATE, MAX_LIST_LINES } from "@/lib/shopping-list";
import { buildListExamples } from "@/lib/shopping-list-examples";
import { EMPTY_SAVE_STATE, MAX_LIST_NAME_LENGTH, MAX_SAVED_LISTS } from "@/lib/saved-list";

/**
 * "Shop your list" (P3d, #114), shown to shoppers as "Quick Shop" since #1145. Sibling forms, not nested ones: the first matches the pasted
 * list, `ListReview` renders the second which adds the reviewed lines, and P10 (#116) adds a
 * third that saves them for next week. Every one is a server action, so all three still submit
 * without client JS.
 *
 * `canSave` comes from the page as a prop rather than being read here — this is a client
 * component and cannot see the session, and CLAUDE.md rules out shipping a `middleware.ts` or
 * `proxy.ts` to carry it. Saving needs an account (a guest has no durable identity to own a saved
 * record); matching and adding do not, and are unchanged for guests.
 *
 * The save form is deliberately OUTSIDE `ListReview`. HTML forbids nested forms, and the add
 * button lives inside the one `ListReview` renders.
 */

/**
 * `exampleNames` are the current vendor's own in-stock product names, fetched by the page (#729) —
 * a client component cannot resolve the vendor. `buildListExamples` falls back to neutral wording
 * when there are none.
 *
 * #1077 — the textarea's placeholder is a fixed PROMPT, not a worked example list. It used to be
 * the latter, and shoppers read it as a list that was already there (triage item 18). Dimming it
 * was tried first and is not available: `tests/token-alpha-purity.test.ts` (#649) bars text below
 * 60% black, and the floor it permits (5.74:1) is more prominent than the placeholder's existing
 * `text-primary-muted` (5.21:1) — so no permitted colour is fainter than the status quo. The
 * worked examples live in the hint ABOVE the box instead, which is also where a shopper needs them
 * (triage item 19). See `lib/shopping-list-examples.ts`.
 */
export function ShopYourList({
  canSave = false,
  exampleNames,
}: {
  canSave?: boolean;
  exampleNames: string[];
}) {
  const [state, formAction, pending] = useActionState(matchList, EMPTY_MATCH_STATE);
  const [saveState, saveAction, saving] = useActionState(saveListFromMatch, EMPTY_SAVE_STATE);
  const { placeholder, exampleName } = buildListExamples(exampleNames);

  const lines = state.lines;

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-3">
        {/* #1145 — the page has no intro paragraph any more, so this label carries the whole
            instruction and is the textarea's accessible name. */}
        <label htmlFor="list" className="block text-sm font-semibold text-primary">
          Paste your list, one item per line.
        </label>
        {/* #1077 — ABOVE the textarea (triage item 19). It used to sit below, where a shopper read
            how quantities work only after typing the list without them. #1145 — one example form
            only; the parser still accepts the others. The limit stays because lines past it are
            dropped silently (`parseList`). */}
        {exampleName !== null ? (
          <p className="text-xs text-primary-muted">
            Add a number for more than one: <span className="font-semibold">2 {exampleName}</span>{" "}
            (up to {MAX_LIST_LINES} items)
          </p>
        ) : (
          <p className="text-xs text-primary-muted">
            Add a number for more than one, like 2 before the item (up to {MAX_LIST_LINES} items)
          </p>
        )}
        <textarea
          id="list"
          name="list"
          rows={8}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-black/10 bg-white p-3 text-sm text-primary placeholder:text-primary-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? "Finding…" : "Find my items"}
        </button>
        {state.error && <p className="text-xs font-semibold text-danger">{state.error}</p>}
      </form>

      {lines && <ListReview lines={lines} />}

      {lines && canSave && (
        <form action={saveAction} className="space-y-2 border-t border-black/10 pt-5">
          <label htmlFor="listName" className="block text-sm font-bold text-primary">
            Save this list for next time
          </label>
          <p className="text-xs text-primary-muted">
            We save your words, not the products — so next week it matches whatever we have in
            today.
          </p>

          {/*
            Every line is carried back, including the unmatched ones: a line this shop doesn't
            stock is the shopper's own note to themselves and re-matches every week. Five
            positional arrays, the same index-alignment discipline add-list-to-cart.ts relies on —
            every line emits all five inputs or none.
          */}
          {lines.map((line, index) => (
            <div key={`save-${index}-${line.original}`}>
              <input type="hidden" name="lineText" value={line.original} />
              <input type="hidden" name="lineTerms" value={line.terms.join(" ")} />
              <input type="hidden" name="lineQuantity" value={line.quantity} />
              <input type="hidden" name="lineMeasure" value={line.measure ?? ""} />
              <input type="hidden" name="lineBrand" value={line.brand ?? ""} />
            </div>
          ))}

          <div className="flex gap-2">
            <input
              id="listName"
              name="name"
              type="text"
              maxLength={MAX_LIST_NAME_LENGTH}
              placeholder="Weekly shop"
              className="min-w-0 flex-1 rounded-2xl border border-black/10 bg-white p-2.5 text-sm text-primary placeholder:text-primary-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            />
            <button
              type="submit"
              disabled={saving}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <BookmarkPlus className="h-4 w-4" aria-hidden />
              {saving ? "Saving…" : "Save list"}
            </button>
          </div>

          {saveState.outcome === "saved" && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <CircleCheck className="h-4 w-4" aria-hidden />
              Saved as “{saveState.name}” — find it under Your lists.
            </p>
          )}
          {saveState.outcome === "capped" && (
            <p className="text-xs font-semibold text-danger">
              You already have {MAX_SAVED_LISTS} saved lists. Delete one to save another.
            </p>
          )}
          {saveState.outcome === "empty" && (
            <p className="text-xs font-semibold text-danger">
              There is nothing in this list to save yet.
            </p>
          )}
        </form>
      )}

      {/* #1131 — a guest used to get nothing here: no save form and no reason. Saving needs an
          account (see the docstring above), so say so where the save form would be. */}
      {lines && !canSave && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5">
          <p className="text-sm text-primary">Sign in to save this list for next time.</p>
          <Link
            href="/login"
            className="inline-flex min-h-tap items-center gap-1.5 rounded-2xl border border-black/10 bg-surface-muted px-4 text-sm font-bold text-primary hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            <LogIn className="h-4 w-4" aria-hidden />
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}
