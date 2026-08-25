import type { FieldError, ParseResult, RawForm } from "@/lib/catalogue-form";

/**
 * Department campaign field rules (P8.5e, #356) — pure, DB-free, unit-tested.
 *
 * Same posture as lib/catalogue-form.ts: every decision about what a submitted
 * field MEANS lives here, where a test can reach it without a database, a
 * session or a request. `features/admin/campaigns.ts` does the FormData
 * reading and the repository call; nothing here knows either exists.
 */

export interface CampaignFormValues {
  headline: string;
  subtitle: string | null;
  linkUrl: string | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface CampaignFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

/**
 * Lives here, not in features/admin/campaigns.ts, because that file is
 * `"use server"` — every export of such a file must be an async function
 * (CLAUDE.md's Server Actions section: Next validates the whole module's
 * export set the moment any one action in it is dispatched).
 */
export const initialCampaignFormState: CampaignFormState = {
  error: null,
  field: null,
  saved: false,
};

export const CAMPAIGN_FIELDS = [
  "headline",
  "subtitle",
  "linkUrl",
  "isActive",
  "startsAt",
  "endsAt",
] as const;

function text(raw: RawForm, field: string): string {
  return (raw[field] ?? "").trim();
}

function requiredText(raw: RawForm, field: string, label: string): ParseResult<string> {
  const value = text(raw, field);
  if (value === "") return { ok: false, error: { field, message: `${label} is required.` } };
  return { ok: true, value };
}

function optionalText(raw: RawForm, field: string): string | null {
  const value = text(raw, field);
  return value === "" ? null : value;
}

/**
 * `linkUrl` follows the deleted `VendorPromotion.linkUrl`'s convention: a
 * relative path only, e.g. `/categories/household?isOffer=true`. Refused, not
 * normalised — an absolute URL almost always means the field was misused
 * (pasted a full address) rather than meant an off-site link, which this
 * repo's campaigns have no reason to support.
 */
function relativeLinkUrl(raw: RawForm): ParseResult<string | null> {
  const value = optionalText(raw, "linkUrl");
  if (value === null) return { ok: true, value: null };
  if (!value.startsWith("/") || value.startsWith("//")) {
    return {
      ok: false,
      error: {
        field: "linkUrl",
        message: "The link must be a relative path, e.g. /categories/household.",
      },
    };
  }
  return { ok: true, value };
}

/** `datetime-local` input value, or blank. Rejects an unparsable non-blank value. */
function optionalDate(raw: RawForm, field: string, label: string): ParseResult<Date | null> {
  const value = text(raw, field);
  if (value === "") return { ok: true, value: null };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: { field, message: `${label} isn't a valid date.` } };
  }
  return { ok: true, value: parsed };
}

export function parseCampaignForm(raw: RawForm): ParseResult<CampaignFormValues> {
  const headline = requiredText(raw, "headline", "Headline");
  if (!headline.ok) return headline;

  const linkUrl = relativeLinkUrl(raw);
  if (!linkUrl.ok) return linkUrl;

  const startsAt = optionalDate(raw, "startsAt", "Start date");
  if (!startsAt.ok) return startsAt;

  const endsAt = optionalDate(raw, "endsAt", "End date");
  if (!endsAt.ok) return endsAt;

  if (startsAt.value !== null && endsAt.value !== null && startsAt.value > endsAt.value) {
    const error: FieldError = {
      field: "endsAt",
      message: "The end date is before the start date.",
    };
    return { ok: false, error };
  }

  return {
    ok: true,
    value: {
      headline: headline.value,
      subtitle: optionalText(raw, "subtitle"),
      linkUrl: linkUrl.value,
      isActive: raw.isActive === "on",
      startsAt: startsAt.value,
      endsAt: endsAt.value,
    },
  };
}
