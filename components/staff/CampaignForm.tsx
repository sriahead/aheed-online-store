"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import { saveCampaign } from "@/features/admin/campaigns";
import { initialCampaignFormState } from "@/lib/campaign-form";
import { formatLocalInput } from "@/lib/local-datetime";
import { CampaignBannerUploader } from "@/components/staff/CampaignBannerUploader";
import type { CampaignRow } from "@/lib/repositories/campaigns";

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

const inputClass =
  "w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-primary/70";
const errorInputClass = "border-danger bg-danger-tint";

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

  const fieldClass = (name: string) =>
    `${inputClass} ${state.field === name ? errorInputClass : ""}`;

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-6">
        <input type="hidden" name="categoryId" value={categoryId} />

        {state.error && (
          <p
            role="alert"
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
              className={fieldClass("headline")}
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
              className={fieldClass("subtitle")}
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
              className={fieldClass("linkUrl")}
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
                className={fieldClass("startsAt")}
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
                className={fieldClass("endsAt")}
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
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {saving ? "Saving…" : campaign ? "Save changes" : "Create campaign"}
          </button>
          <Link
            href="/staff/promotions"
            className="text-sm font-semibold text-primary/70 hover:underline"
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
