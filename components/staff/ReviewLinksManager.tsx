"use client";

import { useActionState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { saveReviewLink, deleteReviewLinkAction } from "@/features/admin/review-links";
import {
  initialReviewLinkState,
  MAX_PLATFORM_LENGTH,
  PLATFORM_FIELD,
  URL_FIELD,
  type ReviewLinkFormState,
} from "@/lib/review-link-form";
import type { ReviewLink } from "@/lib/repositories/vendor-review-links";
import { labelClass } from "@/lib/form-classes";
import { Button } from "@/components/ui/Button";

/**
 * External review-link admin (P9.2, #818).
 *
 * Client component ONLY because `useActionState` is what surfaces a server action's error
 * beside the field that caused it — the forms are real `<form action={...}>` elements and
 * submit without JavaScript. Same pattern as `DeliveryAreaManager.tsx` and `BrandManager.tsx`.
 *
 * `initialReviewLinkState` comes from `lib/review-link-form.ts`, NOT from the `"use server"`
 * actions module beside it: a `"use server"` file may export only async functions, and a
 * value export there makes every action in it 500 at runtime while every build and test
 * stays green (#159).
 *
 * THESE ARE OUTBOUND LINKS. Nothing here, and nothing anywhere in this application, reads
 * reviews back from the sites a vendor lists. Platform names are free text the vendor types
 * — no site is hardcoded, which is what lets a vendor add one nobody has thought of yet
 * without a deploy.
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

function Feedback({ state }: { state: ReviewLinkFormState }) {
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

export function ReviewLinksManager({ links }: { links: ReviewLink[] }) {
  const [state, action, pending] = useActionState(saveReviewLink, initialReviewLinkState);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-bold text-black">Review us elsewhere</h2>
        <p className="mt-1 text-sm text-black/60">
          Links inviting shoppers to review you on other sites. These are links only — reviews
          written elsewhere are never shown on your storefront. Turn one off, or remove it, to hide
          it; with none active, nothing is shown in its place.
        </p>
      </div>

      {links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-semibold text-primary">
                  {link.platform}
                  {!link.isActive && (
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-primary-muted">
                      hidden
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-primary-muted">
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                  {link.url}
                </p>
              </div>

              <form action={deleteReviewLinkAction}>
                <input type="hidden" name="linkId" value={link.id} />
                <button
                  type="submit"
                  aria-label={`Remove ${link.platform}`}
                  className="inline-flex items-center gap-2 rounded-full border border-black/15 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:border-danger hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {/*
        One form for both adding and editing: the action upserts on (vendor, platform), so
        re-entering an existing site name replaces its link rather than failing on the unique
        key. Stated in the hint text so it is not a surprise.
      */}
      <form action={action} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <label className={labelClass} htmlFor="review-link-platform">
              Site name
            </label>
            <input
              id="review-link-platform"
              name="platform"
              maxLength={MAX_PLATFORM_LENGTH}
              required
              placeholder="e.g. the review site's name"
              className={fieldClass(state.field === PLATFORM_FIELD)}
            />
          </div>

          <div className="flex-[2]">
            <label className={labelClass} htmlFor="review-link-url">
              Address of your review page
            </label>
            <input
              id="review-link-url"
              name="url"
              type="text"
              inputMode="url"
              required
              placeholder="https://…"
              className={fieldClass(state.field === URL_FIELD)}
            />
          </div>

          <div className="sm:w-24">
            <label className={labelClass} htmlFor="review-link-order">
              Order
            </label>
            <input
              id="review-link-order"
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={links.length}
              className={fieldClass(state.field === "sortOrder")}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-primary">
          <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 accent-action" />
          Show this link on the storefront
        </label>

        <p className="text-xs text-black/60">
          The address must start with https:// — anything else is refused. Entering a site name you
          already use replaces that link.
        </p>

        <div>
          <Button type="submit" disabled={pending}>
            <Plus className="h-4 w-4" aria-hidden />
            {pending ? "Saving…" : "Save review link"}
          </Button>
        </div>

        <Feedback state={state} />
      </form>
    </section>
  );
}
