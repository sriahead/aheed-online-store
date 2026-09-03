"use client";

import { useActionState } from "react";
import {
  addSynonym,
  manageSynonym,
  proposeSynonymsFromLog,
} from "@/features/admin/search-synonyms";
import { initialSynonymFormState } from "@/lib/synonym-form";
import type { SearchSynonymRow } from "@/lib/repositories/search-synonyms";

/**
 * `/staff/search-synonyms`'s interactive parts (P2.6 slice 3, #566).
 *
 * Client components ONLY because `useActionState` is what surfaces a server action's error text
 * inline — the duplicate-alias case has to be a visible field error rather than a 500 (#347's
 * lesson, where a real duplicate submission 500ed because the adapter's error shape was never
 * checked live). Each form is still a real `<form>` posting a server action, so it degrades to a
 * full page submit with JS off.
 *
 * Every row is ONE form with several `name="intent"` submit buttons rather than several forms:
 * HTML forbids nesting forms, and side-by-side forms would each have to repeat the row's hidden
 * fields.
 */

const statusStyles: Record<SearchSynonymRow["status"], string> = {
  APPROVED: "bg-action-tint text-primary",
  PENDING: "bg-accent-tint text-accent",
  REJECTED: "bg-surface-muted text-primary/60",
};

function FormMessage({
  error,
  notice,
}: {
  error: string | null;
  notice: string | null;
}) {
  if (error) {
    return (
      <p role="alert" className="mt-2 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p role="status" className="mt-2 text-sm text-primary/70">
        {notice}
      </p>
    );
  }
  return null;
}

export function AddSynonymForm() {
  const [state, action, pending] = useActionState(addSynonym, initialSynonymFormState);

  return (
    <form action={action} className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-primary">Shoppers type</span>
          <input
            name="alias"
            required
            placeholder="bhindi"
            className="w-full rounded-lg border border-black/15 px-3 py-2"
            aria-invalid={state.field === "alias" ? true : undefined}
          />
        </label>
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-primary">Your catalogue says</span>
          <input
            name="canonical"
            required
            placeholder="okra"
            className="w-full rounded-lg border border-black/15 px-3 py-2"
            aria-invalid={state.field === "canonical" ? true : undefined}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-action px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          Add
        </button>
      </div>
      <FormMessage error={state.error} notice={state.notice} />
    </form>
  );
}

export function ProposeSynonymsForm() {
  const [state, action, pending] = useActionState(proposeSynonymsFromLog, initialSynonymFormState);

  return (
    <form action={action} className="rounded-2xl border border-black/10 bg-surface-muted p-4">
      <p className="mb-3 text-sm text-primary/70">
        Read this store&apos;s recent searches that found nothing — or found only loosely related
        products — and suggest new entries. Suggestions arrive unapproved; nothing reaches shoppers
        until you approve it.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-action px-4 py-2 font-semibold text-action disabled:opacity-60"
      >
        {pending ? "Looking…" : "Suggest from recent searches"}
      </button>
      <FormMessage error={state.error} notice={state.notice} />
    </form>
  );
}

export function SynonymRowForm({ row }: { row: SearchSynonymRow }) {
  const [state, action, pending] = useActionState(manageSynonym, initialSynonymFormState);

  return (
    <form action={action} className="rounded-2xl border border-black/10 bg-white p-4">
      <input type="hidden" name="id" value={row.id} />
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyles[row.status]}`}
        >
          {row.status.toLowerCase()}
        </span>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-primary/60">
          {row.source.toLowerCase()}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-primary">Shoppers type</span>
          <input
            name="alias"
            defaultValue={row.alias}
            required
            className="w-full rounded-lg border border-black/15 px-3 py-2"
            aria-invalid={state.field === "alias" ? true : undefined}
          />
        </label>
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-primary">Your catalogue says</span>
          <input
            name="canonical"
            defaultValue={row.canonical}
            required
            className="w-full rounded-lg border border-black/15 px-3 py-2"
            aria-invalid={state.field === "canonical" ? true : undefined}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="rounded-full bg-action px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          Save
        </button>
        {row.status === "PENDING" && (
          <>
            <button
              type="submit"
              name="intent"
              value="approve"
              disabled={pending}
              className="rounded-full border border-action px-3 py-1.5 text-sm font-semibold text-action disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="submit"
              name="intent"
              value="reject"
              disabled={pending}
              className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-semibold text-primary/70 disabled:opacity-60"
            >
              Reject
            </button>
          </>
        )}
        <button
          type="submit"
          name="intent"
          value="remove"
          disabled={pending}
          className="rounded-full border border-danger px-3 py-1.5 text-sm font-semibold text-danger disabled:opacity-60"
        >
          Remove
        </button>
      </div>
      <FormMessage error={state.error} notice={state.notice} />
    </form>
  );
}
