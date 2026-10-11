import { DOC_ARTICLES } from "@/app/(admin)/staff/runbook/docs";

/**
 * The only route from a non-staff surface to the generated KMS corpus (#1022).
 *
 * `DOC_ARTICLES` holds every KMS article, internal ones included. `/help` used to filter it by
 * audience and render `[0]`; two internal documents list `shopper` among their audiences, one sorted
 * first, and every vendor's public Help Centre served an internal operations document. Adding a
 * `visibility` test to that filter fixed the symptom on one page — this module fixes the shape:
 *
 * - **Selected by id, not by position.** The guide is named; a second public shopper article can
 *   never displace it by sorting first.
 * - **`visibility: "public"` is required, not assumed.** If the guide is ever re-marked internal,
 *   this returns `null` and the page renders no guide rather than whatever else matches.
 *
 * `tests/public-docs-boundary.test.ts` fails if any file outside `app/(admin)/` other than this one
 * imports the generated module, so a new public surface has to come through here.
 */

export const SHOPPER_GUIDE_ID = "docs/shopper-help/shopping-guide.md";

export interface PublicDocArticle {
  id: string;
  title: string;
  visibility: string;
  content: string;
}

export function getPublicShopperGuide(
  articles: readonly unknown[] = DOC_ARTICLES,
): PublicDocArticle | null {
  for (const article of articles as readonly Partial<PublicDocArticle>[]) {
    if (article?.id !== SHOPPER_GUIDE_ID) continue;
    return article.visibility === "public" ? (article as PublicDocArticle) : null;
  }
  return null;
}
