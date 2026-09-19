import type { ParseResult } from "@/lib/catalogue-form";
import { parseSocialUrl } from "@/lib/social-contact-form";

/**
 * External review-link field rules (P9.2, #818) — pure, DB-free, unit-tested.
 *
 * Same posture as `lib/social-contact-form.ts` (#407) and `lib/delivery-rules-form.ts` (#634):
 * every decision about what a submitted field MEANS lives where a test can reach it without a
 * database, a session or a request. `features/admin/review-links.ts` does the reading and the
 * repository call; nothing here knows either exists.
 *
 * ## The URL rule is reused, not reimplemented
 *
 * `parseSocialUrl` already encodes the rule these links need: exactly one accepted scheme,
 * `https:`, refused by name rather than by absence. That matters because a stored
 * `javascript:` URL is a live script link for every visitor, and `new URL()` parses it
 * perfectly happily — parsing successfully is not the same as being safe to render. A second
 * copy of that reasoning here would be a second copy to get wrong.
 *
 * The one difference: a review link's URL is REQUIRED. For a social field, blank means "hide
 * this element" (#239). For a review link, blank means the row should not exist at all, and
 * deleting the row is how a vendor expresses that — so blank is an error here.
 *
 * ## No platform is named in this file
 *
 * `platform` is free text the vendor supplies. That is what lets a vendor add a review site
 * nobody has thought of yet without a migration or a deploy, and it is why neither "Google"
 * nor "Trustpilot" appears anywhere under `lib/` or `components/` (#818 R49).
 */

export const PLATFORM_FIELD = "platform";
export const URL_FIELD = "url";

/** Longest platform label accepted. Long enough for a real site name, short enough to render. */
export const MAX_PLATFORM_LENGTH = 40;

/**
 * A parsed, validated form submission.
 *
 * Structurally what `lib/repositories/vendor-review-links.ts`'s `ReviewLinkInput` accepts,
 * but named separately and declared here on purpose: the repository layer in this codebase
 * declares its own shapes rather than importing them from form modules (see
 * `lib/repositories/vendor.ts`), and two exported interfaces sharing one name across layers
 * is a readability trap.
 */
export interface ReviewLinkFormValue {
  platform: string;
  url: string;
  sortOrder: number;
  isActive: boolean;
}

/**
 * `useActionState` shape. Lives here rather than in the action module because a
 * `"use server"` file may export ONLY async functions — a same-file value export makes every
 * action in it fail at runtime (#159), and nothing in `lint`/`typecheck`/`test` catches it.
 */
export interface ReviewLinkFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

export const initialReviewLinkState: ReviewLinkFormState = {
  error: null,
  field: null,
  saved: false,
};

/** A non-blank platform label within the length cap. */
export function parsePlatform(raw: string): ParseResult<string> {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { ok: false, error: { field: PLATFORM_FIELD, message: "Enter the site's name." } };
  }

  if (trimmed.length > MAX_PLATFORM_LENGTH) {
    return {
      ok: false,
      error: {
        field: PLATFORM_FIELD,
        message: `Keep the site name to ${MAX_PLATFORM_LENGTH} characters or fewer.`,
      },
    };
  }

  return { ok: true, value: trimmed };
}

/** A sort position: a non-negative integer, defaulting to 0 when blank. */
export function parseSortOrder(raw: string): ParseResult<number> {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: 0 };

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return {
      ok: false,
      error: { field: "sortOrder", message: "Order must be a whole number, 0 or more." },
    };
  }

  return { ok: true, value: parsed };
}

/**
 * A whole review link, or the first error found.
 *
 * `parseSocialUrl` returns `null` for blank, which is a success for a social field and a
 * failure here — so blank is caught explicitly before trusting its result.
 */
export function parseReviewLink(raw: {
  platform: string;
  url: string;
  sortOrder: string;
  isActive: boolean;
}): ParseResult<ReviewLinkFormValue> {
  const platform = parsePlatform(raw.platform);
  if (!platform.ok) return platform;

  if (raw.url.trim() === "") {
    return {
      ok: false,
      error: { field: URL_FIELD, message: "Enter a full address starting with https://" },
    };
  }

  const url = parseSocialUrl(raw.url, URL_FIELD, "review page");
  if (!url.ok) return url;

  const sortOrder = parseSortOrder(raw.sortOrder);
  if (!sortOrder.ok) return sortOrder;

  return {
    ok: true,
    value: {
      platform: platform.value,
      // Non-null: the blank case was refused above, so parseSocialUrl's null branch is
      // unreachable here.
      url: url.value as string,
      sortOrder: sortOrder.value,
      isActive: raw.isActive,
    },
  };
}
