import type { ParseResult } from "@/lib/catalogue-form";
import { collapseWhitespace, STORE_DESCRIPTION_MAX_LENGTH } from "@/lib/store-description";

/**
 * Catalogue settings (#905) — which product labels the staff product form offers, and the store
 * description the AI prompts are given. Pure, DB-free, unit-tested; same posture as
 * `lib/social-contact-form.ts`. `features/admin/storefront.ts` reads the form and calls the
 * repository; nothing here knows either exists.
 *
 * Two rules live here rather than in the action:
 *
 * - **HMC needs Halal.** HMC is a halal certifying body, and the product form only ever offers the
 *   HMC section alongside the Halal label. Saving HMC on with Halal off is REFUSED, not quietly
 *   corrected — silently switching a setting the admin just ticked would leave them believing the
 *   form had saved what they chose.
 * - **The description is one line of at most 200 characters.** Whitespace (newlines included) is
 *   collapsed first and the limit applies after, so a pasted paragraph with blank lines is judged
 *   by what will actually be stored.
 */

export const STORE_DESCRIPTION_FIELD = "storeDescription";
export const SHOW_HMC_FIELD = "showHmcCertification";

/** The seven `VendorConfig` columns the catalogue-settings form owns. */
export interface CatalogueSettingsInput {
  showHalalLabel: boolean;
  showFreshLabel: boolean;
  showOrganicLabel: boolean;
  showVegetarianLabel: boolean;
  showGlutenFreeLabel: boolean;
  showHmcCertification: boolean;
  storeDescription: string | null;
}

/**
 * `useActionState` shape. Lives here, not in the `"use server"` action file, because such a file
 * may export only async functions (CLAUDE.md, Server Actions).
 */
export interface CatalogueSettingsFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

export const initialCatalogueSettingsState: CatalogueSettingsFormState = {
  error: null,
  field: null,
  saved: false,
};

/** A checkbox is on exactly when the browser submitted `"on"` for it. */
export interface CatalogueSettingsRaw {
  showHalalLabel: string | null;
  showFreshLabel: string | null;
  showOrganicLabel: string | null;
  showVegetarianLabel: string | null;
  showGlutenFreeLabel: string | null;
  showHmcCertification: string | null;
  storeDescription: string;
}

export function parseCatalogueSettings(
  raw: CatalogueSettingsRaw,
): ParseResult<CatalogueSettingsInput> {
  const on = (value: string | null) => value === "on";

  const showHalalLabel = on(raw.showHalalLabel);
  const showHmcCertification = on(raw.showHmcCertification);
  if (showHmcCertification && !showHalalLabel) {
    return {
      ok: false,
      error: {
        field: SHOW_HMC_FIELD,
        message: "HMC certification needs the Halal label switched on.",
      },
    };
  }

  const description = collapseWhitespace(raw.storeDescription);
  if (description.length > STORE_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      error: {
        field: STORE_DESCRIPTION_FIELD,
        message: "Keep the store description to 200 characters or fewer.",
      },
    };
  }

  return {
    ok: true,
    value: {
      showHalalLabel,
      showFreshLabel: on(raw.showFreshLabel),
      showOrganicLabel: on(raw.showOrganicLabel),
      showVegetarianLabel: on(raw.showVegetarianLabel),
      showGlutenFreeLabel: on(raw.showGlutenFreeLabel),
      showHmcCertification,
      storeDescription: description === "" ? null : description,
    },
  };
}
