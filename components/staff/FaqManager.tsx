"use client";

import { useActionState, useState } from "react";
import { HelpCircle, Plus, Trash2 } from "lucide-react";
import {
  deleteFaqAction,
  reorderFaqAction,
  saveFaq,
  setFaqActiveAction,
} from "@/features/admin/faqs";
import {
  ANSWER_FIELD,
  initialVendorFaqState,
  MAX_ANSWER_LENGTH,
  MAX_QUESTION_LENGTH,
  QUESTION_FIELD,
  SORT_ORDER_FIELD,
  type VendorFaqFormState,
} from "@/lib/faq-form";
import type { VendorFaqRow } from "@/lib/repositories/vendor-faqs";
import { labelClass } from "@/lib/form-classes";
import { Button } from "@/components/ui/Button";

/**
 * The approved-answer editor (P10, #1012).
 *
 * Client component ONLY because `useActionState` is what surfaces a server action's error beside
 * the field that caused it — the forms are real `<form action={...}>` elements and submit without
 * JavaScript. Same pattern as `ReviewLinksManager.tsx` and `DeliveryAreaManager.tsx`.
 *
 * `initialVendorFaqState` and the length caps come from `lib/faq-form.ts`, NOT from the
 * `"use server"` module beside it: a `"use server"` file may export only async functions, and a
 * value export there makes every action in it 500 at runtime while every build and test stays
 * green (#159).
 *
 * NO EXAMPLE QUESTION OR ANSWER APPEARS HERE, in a placeholder or anywhere else. A sample question
 * is a claim about what this vendor sells, and this platform is multi-tenant: the grocery examples
 * that #905 had to strip out of the staff forms are the precedent. Placeholders are instructions.
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

function fieldClass(invalid: boolean): string {
  return [
    "w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-primary",
    "focus:outline-none focus:ring-2 focus:ring-action focus:ring-offset-2",
    invalid ? "border-danger" : "border-black/15",
  ].join(" ");
}

function Feedback({ state }: { state: VendorFaqFormState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return <p className="mt-2 text-sm text-primary-muted">Saved.</p>;
  }
  return null;
}

export function FaqManager({ faqs }: { faqs: VendorFaqRow[] }) {
  const [state, action, pending] = useActionState(saveFaq, initialVendorFaqState);

  // Which row the single form is currently editing, or null to add a new one. Keyed by id so a
  // re-render after a save does not reopen a row the vendor has just finished with.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? (faqs.find((faq) => faq.id === editingId) ?? null) : null;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-bold text-black">Questions shoppers ask</h2>
        <p className="mt-1 text-sm text-black/60">
          Your own answers, in your own words, shown on your Help Centre page. Write only what is
          true for this store — nothing is filled in for you, and nothing is shown to shoppers until
          you add it. Turn one off, or remove it, to hide it; with none active, no questions section
          appears at all.
        </p>
      </div>

      {faqs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {faqs.map((faq) => (
            <li
              key={faq.id}
              className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-start gap-1.5 font-semibold text-primary">
                    <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0">{faq.question}</span>
                    {!faq.isActive && (
                      <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-primary-muted">
                        hidden
                      </span>
                    )}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-primary-muted">
                    {faq.answer}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(faq.id === editingId ? null : faq.id)}
                    className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:border-action hover:text-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                  >
                    {faq.id === editingId ? "Cancel" : "Edit"}
                  </button>

                  {/* Visibility and order are one-field forms on purpose: resubmitting the whole
                      question and answer to toggle a checkbox is how an edit form silently
                      reverts someone else's concurrent change. */}
                  <form action={setFaqActiveAction}>
                    <input type="hidden" name="faqId" value={faq.id} />
                    {faq.isActive ? null : <input type="hidden" name="isActive" value="on" />}
                    <button
                      type="submit"
                      className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:border-action hover:text-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                    >
                      {faq.isActive ? "Hide" : "Show"}
                    </button>
                  </form>

                  <form action={reorderFaqAction} className="flex items-center gap-1">
                    <input type="hidden" name="faqId" value={faq.id} />
                    <label className="sr-only" htmlFor={`faq-order-${faq.id}`}>
                      Order for {faq.question}
                    </label>
                    <input
                      id={`faq-order-${faq.id}`}
                      name="sortOrder"
                      type="number"
                      min={0}
                      defaultValue={faq.sortOrder}
                      className="w-16 rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-action"
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:border-action hover:text-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                    >
                      Set
                    </button>
                  </form>

                  <form action={deleteFaqAction}>
                    <input type="hidden" name="faqId" value={faq.id} />
                    <button
                      type="submit"
                      aria-label={`Remove the answer to: ${faq.question}`}
                      className="inline-flex items-center gap-2 rounded-full border border-black/15 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:border-danger hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Remove
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/*
        One form for both adding and editing. `faqId` present means edit; absent means add. The id
        is never trusted on its own — every repository write carries vendorId in its `where`, so a
        forged id changes nothing (see lib/repositories/vendor-faqs.ts).
      */}
      <form action={action} className="flex flex-col gap-3" key={editing?.id ?? "new"}>
        {editing && <input type="hidden" name="faqId" value={editing.id} />}

        <div>
          <label className={labelClass} htmlFor="faq-question">
            {editing ? "Edit the question" : "Question"}
          </label>
          <input
            id="faq-question"
            name="question"
            maxLength={MAX_QUESTION_LENGTH}
            required
            defaultValue={editing?.question ?? ""}
            placeholder="Type a question a shopper actually asks you"
            className={fieldClass(state.field === QUESTION_FIELD)}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="faq-answer">
            Answer
          </label>
          <textarea
            id="faq-answer"
            name="answer"
            rows={4}
            maxLength={MAX_ANSWER_LENGTH}
            required
            defaultValue={editing?.answer ?? ""}
            placeholder="Answer it in your own words, as you would in the shop"
            className={fieldClass(state.field === ANSWER_FIELD)}
          />
          <p className="mt-1 text-xs text-black/60">
            Plain text, up to {MAX_ANSWER_LENGTH} characters. Line breaks are kept; styling and
            links are not shown.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="w-24">
            <label className={labelClass} htmlFor="faq-order">
              Order
            </label>
            <input
              id="faq-order"
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={editing?.sortOrder ?? faqs.length}
              className={fieldClass(state.field === SORT_ORDER_FIELD)}
            />
          </div>

          <label className="flex items-center gap-2 pb-2.5 text-sm text-primary">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={editing?.isActive ?? true}
              className="h-4 w-4 accent-action"
            />
            Show this on the Help Centre
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            <Plus className="h-4 w-4" aria-hidden />
            {pending ? "Saving…" : editing ? "Save changes" : "Add answer"}
          </Button>
          {editing && (
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="text-sm font-semibold text-primary-muted underline hover:text-primary"
            >
              Stop editing
            </button>
          )}
        </div>

        <Feedback state={state} />
      </form>
    </section>
  );
}
