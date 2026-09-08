"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import { saveCampaign } from "@/features/admin/campaigns";
import { initialCampaignFormState } from "@/lib/campaign-form";
import { formatLocalInput } from "@/lib/local-datetime";
import { CampaignBannerUploader } from "@/components/staff/CampaignBannerUploader";
import type { CampaignRow } from "@/lib/repositories/campaigns";
import { FormField } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";

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

  // #650/#656 — `FormField` carries the className-and-ARIA pairing that used
  // to be this file's own `fieldProps` closure: a field cannot be styled as
  // invalid without also being announced as invalid (R8). Every field here
  // points at the same shared banner id, matching the pre-existing
  // `fieldProps` convention.
  const isInvalid = (name: string) => state.field === name;

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
          <FormField
            name="headline"
            label="Headline"
            required
            placeholder={categoryName}
            defaultValue={campaign?.headline ?? ""}
            error={isInvalid("headline")}
            errorId="campaign-form-error"
          />

          <FormField
            name="subtitle"
            label="Subtitle (optional)"
            defaultValue={campaign?.subtitle ?? ""}
            error={isInvalid("subtitle")}
            errorId="campaign-form-error"
          />

          <FormField
            name="linkUrl"
            label="Link (optional — defaults to this department's own page)"
            placeholder="/categories/..."
            defaultValue={campaign?.linkUrl ?? ""}
            error={isInvalid("linkUrl")}
            errorId="campaign-form-error"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              name="startsAt"
              label="Starts (optional)"
              type="datetime-local"
              defaultValue={formatLocalInput(campaign?.startsAt ?? null)}
              error={isInvalid("startsAt")}
              errorId="campaign-form-error"
            />
            <FormField
              name="endsAt"
              label="Ends (optional)"
              type="datetime-local"
              defaultValue={formatLocalInput(campaign?.endsAt ?? null)}
              error={isInvalid("endsAt")}
              errorId="campaign-form-error"
            />
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
          <Button variant="primary" disabled={saving}>
            <Save className="h-4 w-4" aria-hidden />
            {saving ? "Saving…" : campaign ? "Save changes" : "Create campaign"}
          </Button>
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
