"use client";

import { useActionState } from "react";
import { suggestNetContent } from "@/features/admin/net-content-suggestions";
import { initialNetContentReviewState } from "@/lib/net-content-review-form";

/**
 * #927 — `/staff/net-content`'s "Suggest net content" button, rendered for store admins only.
 *
 * A real `<form>` posting a server action, the same shape as `ProposeSynonymsForm`, so it works
 * without client JS and can be driven with curl. The outcome renders inline — never `alert()`,
 * which freezes the tab (#507).
 */
export function SuggestNetContentForm() {
  const [state, action, pending] = useActionState(suggestNetContent, initialNetContentReviewState);

  return (
    <form action={action} className="mb-6 rounded-2xl border border-black/10 bg-surface-muted p-4">
      <p className="mb-3 text-sm text-primary-muted">
        First reads pack sizes that are certain from product names and per-kg prices, free and
        without AI. Then asks the AI about up to 10 more products that don&apos;t have one yet.
        Suggestions arrive below for review; nothing changes on a product until you accept it.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-action px-4 py-2 font-semibold text-action disabled:opacity-60"
      >
        {pending ? "Suggesting…" : "Suggest net content"}
      </button>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      ) : state.notice ? (
        <p role="status" className="mt-2 text-sm text-primary-muted">
          {state.notice}
        </p>
      ) : null}
    </form>
  );
}
