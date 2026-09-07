"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import { saveCampaign } from "@/features/admin/campaigns";
import { initialCampaignFormState } from "@/lib/campaign-form";
import { formatLocalInput } from "@/lib/local-datetime";
import { CampaignBannerUploader } from "@/components/staff/CampaignBannerUploader";
import type { CampaignRow } from "@/lib/repositories/campaigns";
import { errorInputClass, inputClass, labelClass } from "@/lib/form-classes";

/**
 * Department campaign edit form (P8.5e, #356) — modelled on
 * `CategoryForm.tsx`'s `useActionState` wiring.
 *
 * One form for both create and edit: `campaign` is null when the department
 * has no campaign row yet, and `saveCampaign` upserts on the hidden
 * `categoryId` either way (mirrors `upsertCampaign`'s own create-or-update
 * shape, unlike `saveCategory`'s explicit create/update branch, because a
 * campaign has no separate "new" URL — every top-level department always has
 * exactly one editable slot).
 */

export function CampaignForm({
  categoryId,
  categoryName,
  campaign,
  imageUrl,
}: {
  categoryId: string;
  categoryName: string;
  campaign: CampaignRow | null;
  imageUrl: string | null;
}) {
  const [state, action, saving] = useActionState(saveCampaign, initialCampaignFormState);

  /**
   * #650 — the className AND the ARIA pair, from one call, so a field cannot be
   * styled as invalid without also being announced as invalid. `errorInputClass`
   * is a border and a background tint: on its own it tells a sighted mouse user
   * which field is wrong and a screen-reader user nothing at all (WCAG SC 1.4.1
   * Use of Colour, SC 3.3.1 Error Identification). Returning both together is why
   * this is `fieldProps` rather than the old `fieldClass` — a future field added
   * to this form gets the association by construction instead of by remembering.
   */
  const fieldProps = (name: string) => {
    const invalid = state.field === name;
    return {
      className: `${inputClass} ${invalid ? errorInputClass : ""}`,
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? "campaign-form-error" : undefined,
    };
  };

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-6">
        <input type="hidden" name="categoryId" value={categoryId} />

        {state.error && (
          <p
            role="alert"
            id="campaign-form-error"
            className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
          >
            {state.error}
          </p>
        )}
        {state.saved && !state.error && (
          <p
            role="status"
            className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
          >
            Campaign saved.
          </p>
        )}

        <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
          <div>
            <label className={labelClass} htmlFor="headline">
              Headline
            </label>
            <input
              id="headline"
              name="headline"
              required
              placeholder={categoryName}
              defaultValue={campaign?.headline ?? ""}
              {...fieldProps("headline")}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="subtitle">
              Subtitle (optional)
            </label>
            <input
              id="subtitle"
              name="subtitle"
              defaultValue={campaign?.subtitle ?? ""}
              {...fieldProps("subtitle")}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="linkUrl">
              Link (optional — defaults to this department&apos;s own page)
            </label>
            <input
              id="linkUrl"
              name="linkUrl"
              placeholder={`/categories/...`}
              defaultValue={campaign?.linkUrl ?? ""}
              {...fieldProps("linkUrl")}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="startsAt">
                Starts (optional)
              </label>
              <input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                defaultValue={formatLocalInput(campaign?.startsAt ?? null)}
                {...fieldProps("startsAt")}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="endsAt">
                Ends (optional)
              </label>
              <input
                id="endsAt"
                name="endsAt"
                type="datetime-local"
                defaultValue={formatLocalInput(campaign?.endsAt ?? null)}
                {...fieldProps("endsAt")}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-primary">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={campaign?.isActive ?? true}
              className="h-4 w-4 rounded border-black/20"
            />
            Active
          </label>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {saving ? "Saving…" : campaign ? "Save changes" : "Create campaign"}
          </button>
          <Link
            href="/staff/promotions"
            className="text-sm font-semibold text-primary-muted hover:underline"
          >
            Back to campaigns
          </Link>
        </div>
      </form>

      <CampaignBannerUploader
        categoryId={categoryId}
        currentImageUrl={imageUrl}
        currentAltText={campaign?.altText ?? ""}
        hasCampaign={campaign !== null}
      />
    </div>
  );
}
