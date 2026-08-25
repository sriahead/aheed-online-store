import type { ParseResult, RawForm } from "@/lib/catalogue-form";

/**
 * Bundle field rules (P8.5c, #347) — pure, DB-free, unit-tested.
 *
 * Same posture as lib/campaign-form.ts: every decision about what a submitted
 * field MEANS lives here, where a test can reach it without a database, a
 * session or a request. `features/admin/bundles.ts` does the FormData reading
 * and the repository call; nothing here knows either exists.
 */

export interface BundleFormValues {
  slug: string;
  name: string;
  tagline: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface BundleFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

/**
 * Lives here, not in features/admin/bundles.ts, because that file is
 * `"use server"` — every export of such a file must be an async function
 * (CLAUDE.md's Server Actions section: Next validates the whole module's export
 * set the moment any one action in it is dispatched, so a same-file constant
 * makes EVERY action in the file 500).
 */
export const initialBundleFormState: BundleFormState = {
  error: null,
  field: null,
  saved: false,
};

export const BUNDLE_FIELDS = ["slug", "name", "tagline", "isActive", "sortOrder"] as const;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(raw: RawForm, field: string): string {
  return (raw[field] ?? "").trim();
}

function optionalText(raw: RawForm, field: string): string | null {
  const value = text(raw, field);
  return value === "" ? null : value;
}

export function parseBundleForm(raw: RawForm): ParseResult<BundleFormValues> {
  const name = text(raw, "name");
  if (name === "") {
    return { ok: false, error: { field: "name", message: "Name is required." } };
  }

  const slug = text(raw, "slug");
  if (slug === "") {
    return { ok: false, error: { field: "slug", message: "Web address is required." } };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: {
        field: "slug",
        message: "Use lowercase letters, numbers and single hyphens, e.g. weekly-meat-box.",
      },
    };
  }

  const rawSortOrder = text(raw, "sortOrder");
  const sortOrder = rawSortOrder === "" ? 0 : Number(rawSortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    return {
      ok: false,
      error: { field: "sortOrder", message: "Display order must be a whole number of 0 or more." },
    };
  }

  return {
    ok: true,
    value: {
      slug,
      name,
      tagline: optionalText(raw, "tagline"),
      isActive: raw.isActive === "on",
      sortOrder,
    },
  };
}

export interface ParsedBundleItem {
  productId: string;
  quantity: number;
}

/**
 * Parse the constituent rows out of the edit form's repeated fields.
 *
 * The two arrays are read POSITIONALLY — the form emits a `productId` and a
 * `quantity` for every row or neither, so they stay aligned. Same contract
 * `addListToCart` relies on for its review step, and the same reason a `<select>`
 * has to be serialised in document order when driving this headlessly (see
 * `sdd-workflow.md`'s server-action notes).
 *
 * A row with a blank `productId` is a deliberately-skipped empty row, dropped
 * silently. A row with a real product but an unusable quantity is an ERROR, not
 * a silent drop: it means the admin typed something, and quietly discarding it
 * would leave them looking at a saved bundle missing the line they just entered.
 */
export function parseBundleItems(
  productIds: readonly string[],
  quantities: readonly string[],
): ParseResult<ParsedBundleItem[]> {
  const items: ParsedBundleItem[] = [];

  for (const [index, rawId] of productIds.entries()) {
    const productId = rawId.trim();
    if (productId === "") continue;

    const quantity = Number((quantities[index] ?? "").trim());
    if (!Number.isInteger(quantity) || quantity < 1) {
      return {
        ok: false,
        error: {
          field: "items",
          message: "Every product's quantity must be a whole number of 1 or more.",
        },
      };
    }

    items.push({ productId, quantity });
  }

  const seen = new Set(items.map((item) => item.productId));
  if (seen.size !== items.length) {
    return {
      ok: false,
      error: { field: "items", message: "That product is already in this bundle." },
    };
  }

  return { ok: true, value: items };
}
