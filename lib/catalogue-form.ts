import { parsePriceInput } from "@/components/product/parse-price-input";
import { isNetContentUnit, type NetContentUnit } from "@/components/product/unit-price";

/**
 * Catalogue admin field rules (P6b1, #159) — pure, DB-free, unit-tested.
 *
 * Same posture as lib/staff-orders-query.ts (P6a) and lib/shopping-list.ts
 * (P3d): every decision about what a submitted field MEANS lives where a test
 * can reach it without a database, a session or a request. The server actions in
 * features/admin/catalogue.ts do the FormData reading and the repository calls;
 * nothing here knows either exists.
 *
 * Errors are RETURNED, never thrown. A bad price is an ordinary thing for a
 * human to type, and the form has to re-render with the field named — an
 * exception would have to be caught and converted at every call site anyway.
 */

export interface FieldError {
  /** Matches the form control's `name`, so the UI can point at the right input. */
  field: string;
  message: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: FieldError };

/** What the actions read out of FormData — deliberately plain strings, so tests need no FormData. */
export type RawForm = Record<string, string | undefined>;

export interface ProductFormValues {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  basePrice: number;
  originalPrice: number | null;
  unitLabel: string;
  /**
   * #398 (derivation half, P9.3) — net content, so `components/product/unit-price.ts` can
   * derive a real unit price instead of trusting `unitLabel`'s free text. Both null or both set —
   * `parseNetContentFields` below enforces that half-typed pairing is rejected, matching
   * `tier`'s own both-or-neither shape a few fields down.
   */
  netContentAmount: number | null;
  netContentUnit: NetContentUnit | null;
  origin: string | null;
  isHalal: boolean;
  isFresh: boolean;
  isOrganic: boolean;
  /** P2.6 slice 6 (#569) — dietary facets. */
  isVegetarian: boolean;
  isGlutenFree: boolean;
  /**
   * #569 — HMC certification, and the two fields that substantiate it.
   *
   * The INVARIANT this parser enforces: `isHmcCertified` is true only when BOTH `hmcReference` and
   * `hmcVerifiedAt` are present, and both are null whenever it is false. HMC is a named
   * third-party certifying body, and #239 was a real incident where this codebase asserted
   * "100% Certified HMC Halal" for a vendor with no basis for it — a bare tickable boolean would
   * re-create that exposure one product at a time.
   */
  isHmcCertified: boolean;
  hmcReference: string | null;
  hmcVerifiedAt: Date | null;
  /** #569 — the chosen brand's id, or null for "no brand". */
  brandId: string | null;
  isFeatured: boolean;
  isActive: boolean;
  quantity: number;
  lowStockThreshold: number;
  /**
   * P8.5d (#348) — the product's multi-buy tier, or null to clear it.
   *
   * null and "an inactive tier" are different intents and both are reachable:
   * clearing both number fields removes the row, while unticking the active box
   * keeps the numbers so a seasonal multi-buy can be switched back on without
   * being retyped.
   */
  tier: ProductTierFormValues | null;
}

export interface ProductTierFormValues {
  groupQuantity: number;
  groupPricePence: number;
  isActive: boolean;
}

export interface CategoryFormValues {
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CatalogueFormState {
  error: string | null;
  /** The control to point at, matching the input's `name`. Null for whole-form errors. */
  field: string | null;
  saved: boolean;
}

/**
 * The initial `useActionState` value for both catalogue forms.
 *
 * Lives here, not in features/admin/catalogue.ts, because that file is
 * `"use server"` — every export of such a file must be an async function
 * (Next throws `ensureServerEntryExports`'s "found object" error the moment
 * ANY action in the file is dispatched otherwise, since the whole module's
 * export set is validated together, not just the one being called). A plain
 * state constant has no business there regardless of that constraint.
 */
export const initialCatalogueState: CatalogueFormState = {
  error: null,
  field: null,
  saved: false,
};

/** First and last code point of Unicode's Combining Diacritical Marks block. */
const COMBINING_MARK_FIRST = 0x300;
const COMBINING_MARK_LAST = 0x36f;

/**
 * Drop the combining marks NFKD splits off from letters like "è".
 *
 * Written as a loop rather than a regex character class deliberately: the class
 * would have to carry the two code points literally, and a pair of bare
 * combining marks in source is invisible in review and easy for a tool to
 * mangle. Without this step the generic [^a-z0-9] pass below would turn each
 * orphaned mark into a separator, making "Crème" into "cre-me".
 */
function stripCombiningMarks(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < COMBINING_MARK_FIRST || code > COMBINING_MARK_LAST) out += char;
  }
  return out;
}

/**
 * A URL-safe slug, or "" when the input has nothing usable in it.
 *
 * Diacritics are folded rather than dropped, so "Crème Fraîche" becomes
 * "creme-fraiche" and not "cr-me-fra-che" — a UK grocery catalogue carries
 * plenty of them.
 */
export function slugify(input: string): string {
  return stripCombiningMarks(input.normalize("NFKD"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function text(raw: RawForm, field: string): string {
  return (raw[field] ?? "").trim();
}

/** An HTML checkbox submits its value only when checked; absent means false. */
function checkbox(raw: RawForm, field: string): boolean {
  const value = raw[field];
  return value !== undefined && value !== "" && value !== "off";
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

/** A whole number ≥ min. Rejects "", "abc", "1.5" and negatives identically. */
function wholeNumber(raw: RawForm, field: string, label: string, min: number): ParseResult<number> {
  const value = text(raw, field);
  const parsed = Number(value);
  if (value === "" || !Number.isInteger(parsed) || parsed < min) {
    return {
      ok: false,
      error: { field, message: `${label} must be a whole number of at least ${min}.` },
    };
  }
  return { ok: true, value: parsed };
}

/**
 * The slug rule for both models: a blank field is derived from the name, and a
 * typed one is normalised through the same function — so no slug this module
 * accepts can differ in shape from one it generated.
 */
function resolveSlug(raw: RawForm, name: string): ParseResult<string> {
  const typed = text(raw, "slug");
  const slug = slugify(typed === "" ? name : typed);
  if (slug === "") {
    return {
      ok: false,
      error: {
        field: "slug",
        message: "The web address needs at least one letter or number — add one, or edit the name.",
      },
    };
  }
  return { ok: true, value: slug };
}

export function parseProductForm(raw: RawForm): ParseResult<ProductFormValues> {
  const name = requiredText(raw, "name", "Name");
  if (!name.ok) return name;

  const slug = resolveSlug(raw, name.value);
  if (!slug.ok) return slug;

  const categoryId = requiredText(raw, "categoryId", "Category");
  if (!categoryId.ok) return categoryId;

  const unitLabel = requiredText(raw, "unitLabel", "Unit label");
  if (!unitLabel.ok) return unitLabel;

  // parsePriceInput() returns undefined for blank, non-numeric AND negative
  // input alike — all three are "this isn't a price", so one message covers them.
  const basePrice = parsePriceInput(text(raw, "basePrice"));
  if (basePrice === undefined) {
    return {
      ok: false,
      error: { field: "basePrice", message: "Price must be an amount in pounds, like 2.40." },
    };
  }

  const originalRaw = text(raw, "originalPrice");
  let originalPrice: number | null = null;
  if (originalRaw !== "") {
    const parsed = parsePriceInput(originalRaw);
    if (parsed === undefined) {
      return {
        ok: false,
        error: {
          field: "originalPrice",
          message: "Was-price must be an amount in pounds, like 3.00 — or leave it blank.",
        },
      };
    }
    // A "was" price at or below the current price would render a discount badge
    // advertising a saving of zero or less. Blank means "not on offer".
    if (parsed <= basePrice) {
      return {
        ok: false,
        error: {
          field: "originalPrice",
          message: "Was-price must be higher than the price, or blank if this isn't on offer.",
        },
      };
    }
    originalPrice = parsed;
  }

  const quantity = wholeNumber(raw, "quantity", "Stock", 0);
  if (!quantity.ok) return quantity;

  const lowStockThreshold = wholeNumber(raw, "lowStockThreshold", "Low-stock threshold", 0);
  if (!lowStockThreshold.ok) return lowStockThreshold;

  const netContent = parseNetContentFields(raw);
  if (!netContent.ok) return netContent;

  const tier = parseTierFields(raw, basePrice);
  if (!tier.ok) return tier;

  const hmc = parseHmcFields(raw);
  if (!hmc.ok) return hmc;

  return {
    ok: true,
    value: {
      name: name.value,
      slug: slug.value,
      // The schema's `description` is non-null, so a blank one is "" not null.
      description: text(raw, "description"),
      categoryId: categoryId.value,
      basePrice,
      originalPrice,
      unitLabel: unitLabel.value,
      netContentAmount: netContent.value.netContentAmount,
      netContentUnit: netContent.value.netContentUnit,
      origin: optionalText(raw, "origin"),
      isHalal: checkbox(raw, "isHalal"),
      isVegetarian: checkbox(raw, "isVegetarian"),
      isGlutenFree: checkbox(raw, "isGlutenFree"),
      isHmcCertified: hmc.value.isHmcCertified,
      hmcReference: hmc.value.hmcReference,
      hmcVerifiedAt: hmc.value.hmcVerifiedAt,
      brandId: optionalText(raw, "brandId"),
      isFresh: checkbox(raw, "isFresh"),
      isOrganic: checkbox(raw, "isOrganic"),
      isFeatured: checkbox(raw, "isFeatured"),
      isActive: checkbox(raw, "isActive"),
      quantity: quantity.value,
      lowStockThreshold: lowStockThreshold.value,
      tier: tier.value,
    },
  };
}

/**
 * #569 — HMC certification and its provenance, parsed as one unit because they are one claim.
 *
 * Ticked means BOTH fields are required: a certification asserted with nothing recording who
 * verified it or when is exactly what #239 made expensive. Unticked NULLS BOTH regardless of what
 * was typed, so a flag that gets switched off cannot leave a stale reference behind to be read as
 * still-current by a later reader.
 *
 * `hmcVerifiedAt` comes from an `input type="date"`, which submits a DATE-ONLY ISO string
 * ("2026-09-05"). That is deliberately not `datetime-local`: a `datetime-local` value is a naked
 * wall-clock string that ECMAScript interprets in the runtime's own zone, which is the whole reason
 * `lib/local-datetime.ts` exists (a Worker and a UK laptop disagreed by the summer offset). A
 * date-only form has no such ambiguity — the spec fixes it to UTC — so this needs no timezone
 * machinery, and reaching for that helper here would add complexity for a problem this input shape
 * does not have.
 */
function parseHmcFields(raw: RawForm): ParseResult<{
  isHmcCertified: boolean;
  hmcReference: string | null;
  hmcVerifiedAt: Date | null;
}> {
  const isHmcCertified = checkbox(raw, "isHmcCertified");
  if (!isHmcCertified) {
    return { ok: true, value: { isHmcCertified: false, hmcReference: null, hmcVerifiedAt: null } };
  }

  const reference = optionalText(raw, "hmcReference");
  if (reference === null) {
    return {
      ok: false,
      error: {
        field: "hmcReference",
        message: "Enter the HMC certificate reference, or untick HMC certified.",
      },
    };
  }

  const verifiedRaw = text(raw, "hmcVerifiedAt");
  if (verifiedRaw === "") {
    return {
      ok: false,
      error: {
        field: "hmcVerifiedAt",
        message: "Enter the date the HMC certificate was verified, or untick HMC certified.",
      },
    };
  }

  const verifiedAt = new Date(`${verifiedRaw}T00:00:00.000Z`);
  if (Number.isNaN(verifiedAt.getTime())) {
    return {
      ok: false,
      error: { field: "hmcVerifiedAt", message: "Enter a valid date, like 2026-09-05." },
    };
  }

  return {
    ok: true,
    value: { isHmcCertified: true, hmcReference: reference, hmcVerifiedAt: verifiedAt },
  };
}

/**
 * #398 (derivation half, P9.3) — net content, parsed as one unit for the same reason the HMC
 * fields above are: a half-typed pair (an amount with no unit, or a unit with no amount) is not a
 * usable net content and must be refused with the empty field named, matching the multi-buy
 * tier's own both-or-neither shape below. Both blank means "no net content", which is the
 * majority of existing products (R34's `unitLabel`-only fallback) and is not an error.
 *
 * `netContentAmount` is a WHOLE NUMBER (`wholeNumber`, min 1) in the chosen unit's own scale —
 * see the schema comment on `Product.netContentAmount` for why a fractional amount in a coarser
 * unit (e.g. "0.5 KILOGRAM") is never accepted; a half-kilogram product is typed as 500 GRAM.
 */
function parseNetContentFields(
  raw: RawForm,
): ParseResult<{ netContentAmount: number | null; netContentUnit: NetContentUnit | null }> {
  const amountRaw = text(raw, "netContentAmount");
  const unitRaw = text(raw, "netContentUnit");

  if (amountRaw === "" && unitRaw === "") {
    return { ok: true, value: { netContentAmount: null, netContentUnit: null } };
  }

  if (unitRaw === "") {
    return {
      ok: false,
      error: {
        field: "netContentUnit",
        message: "Choose a unit of measure, or clear the net content amount.",
      },
    };
  }
  if (!isNetContentUnit(unitRaw)) {
    return {
      ok: false,
      error: { field: "netContentUnit", message: "Choose a valid unit of measure." },
    };
  }

  if (amountRaw === "") {
    return {
      ok: false,
      error: {
        field: "netContentAmount",
        message: "Enter the net content amount, or clear the unit of measure.",
      },
    };
  }
  // wholeNumber() rejects "", non-integers and negatives identically — a non-numeric amount
  // re-renders with THIS field named rather than throwing (R33).
  const amount = wholeNumber(raw, "netContentAmount", "Net content amount", 1);
  if (!amount.ok) return amount;

  return { ok: true, value: { netContentAmount: amount.value, netContentUnit: unitRaw } };
}

/** The smallest group a multi-buy can have. See MIN_TIER_GROUP_QUANTITY's note. */
const MIN_TIER_GROUP_QUANTITY = 2;

/**
 * The multi-buy tier fields (P8.5d, #348), validated against the base price the
 * same form just supplied.
 *
 * Both blank means "no multi-buy" and clears any existing one. Filling one and
 * not the other is a half-typed offer, so it is refused with the empty field
 * named rather than guessed at.
 *
 * THE GROUP PRICE MUST BEAT BUYING THAT MANY SINGLY. Exactly the rule
 * `originalPrice` already carries above ("must be higher than the price"), for
 * exactly the same reason: a tier at or above `groupQuantity * basePrice`
 * advertises a saving of zero or less. `lib/tier-pricing.ts` clamps such a tier
 * at runtime so a shopper can never be overcharged, but the clamp is a
 * last-resort guard — the form is where a typo should be caught and explained.
 */
function parseTierFields(
  raw: RawForm,
  basePrice: number,
): ParseResult<ProductTierFormValues | null> {
  const quantityRaw = text(raw, "tierGroupQuantity");
  const priceRaw = text(raw, "tierGroupPrice");

  if (quantityRaw === "" && priceRaw === "") return { ok: true, value: null };

  if (quantityRaw === "") {
    return {
      ok: false,
      error: {
        field: "tierGroupQuantity",
        message: "Enter how many items the multi-buy price covers, or clear the multi-buy price.",
      },
    };
  }
  if (priceRaw === "") {
    return {
      ok: false,
      error: {
        field: "tierGroupPrice",
        message: "Enter the multi-buy price, or clear the multi-buy quantity.",
      },
    };
  }

  const groupQuantity = wholeNumber(
    raw,
    "tierGroupQuantity",
    "Multi-buy quantity",
    MIN_TIER_GROUP_QUANTITY,
  );
  if (!groupQuantity.ok) return groupQuantity;

  const groupPricePence = parsePriceInput(priceRaw);
  if (groupPricePence === undefined) {
    return {
      ok: false,
      error: {
        field: "tierGroupPrice",
        message: "Multi-buy price must be an amount in pounds, like 10.00.",
      },
    };
  }

  if (groupPricePence >= groupQuantity.value * basePrice) {
    return {
      ok: false,
      error: {
        field: "tierGroupPrice",
        message: "Multi-buy price must be less than buying that many at the normal price.",
      },
    };
  }

  return {
    ok: true,
    value: {
      groupQuantity: groupQuantity.value,
      groupPricePence,
      isActive: checkbox(raw, "tierIsActive"),
    },
  };
}

export function parseCategoryForm(raw: RawForm): ParseResult<CategoryFormValues> {
  const name = requiredText(raw, "name", "Name");
  if (!name.ok) return name;

  const slug = resolveSlug(raw, name.value);
  if (!slug.ok) return slug;

  const sortOrder = wholeNumber(raw, "sortOrder", "Sort order", 0);
  if (!sortOrder.ok) return sortOrder;

  return {
    ok: true,
    value: {
      name: name.value,
      slug: slug.value,
      // Blank means top-level. Whether the referenced category is ITSELF
      // top-level is a database question, answered in the repository.
      parentId: optionalText(raw, "parentId"),
      sortOrder: sortOrder.value,
      isActive: checkbox(raw, "isActive"),
    },
  };
}

/** FormData -> RawForm. Kept here so field names are declared once, beside their rules. */
export function readForm(form: FormData, fields: readonly string[]): RawForm {
  const raw: RawForm = {};
  for (const field of fields) {
    const value = form.get(field);
    if (value !== null) raw[field] = typeof value === "string" ? value : "";
  }
  return raw;
}

export const PRODUCT_FIELDS = [
  "name",
  "slug",
  "description",
  "categoryId",
  "basePrice",
  "originalPrice",
  "unitLabel",
  // #398 (derivation half) — a field missing from this list is invisible to readForm() no
  // matter how correctly the form renders it or parseNetContentFields handles it.
  "netContentAmount",
  "netContentUnit",
  "origin",
  "isHalal",
  "isFresh",
  "isOrganic",
  // #569 — a field absent from THIS list is never read out of the FormData at all, however
  // correctly the form renders it and the parser handles it.
  "isVegetarian",
  "isGlutenFree",
  "isHmcCertified",
  "hmcReference",
  "hmcVerifiedAt",
  "brandId",
  "isFeatured",
  "isActive",
  "quantity",
  "lowStockThreshold",
  "tierGroupQuantity",
  "tierGroupPrice",
  "tierIsActive",
] as const;

export const CATEGORY_FIELDS = ["name", "slug", "parentId", "sortOrder", "isActive"] as const;

/* ------------------------------------------------------------------------- *
 * Category picker grouping (#630)
 * ------------------------------------------------------------------------- */

/** The shape of an `AdminCategoryRow` this module needs, so no repository
 *  module is pulled into the client bundle just for a type. */
export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

export interface CategoryOptionGroup {
  /** The department itself — selectable in its own right, never a label only. */
  parent: CategoryOption;
  children: CategoryOption[];
}

/**
 * Group categories into one `optgroup` per department for the product form
 * (#630).
 *
 * The form previously rendered ONE flat select over every tier, labelled
 * "Parent → Child" for children, in the globally-interleaved order #627
 * describes. Both tiers are genuinely assignable and both are genuinely in use:
 * `prisma/seed.ts` assigns hand-curated products to a TOP-LEVEL category, while
 * `seedGeneratedCatalogue` assigns generated ones to subcategories, and
 * `prisma/schema.prisma` constrains neither.
 *
 * So the department stays selectable inside its own group rather than becoming
 * a label. A "pick a category, then pick a subcategory" cascade would have read
 * more naturally and silently removed the direct-to-department capability —
 * which is exactly the failure #630 was filed to prevent.
 *
 * Ordering is not re-derived here: `listCategoriesForAdmin` already returns
 * parents immediately followed by their own children (#627). This walk only
 * reshapes. A child whose parent is absent becomes its own group, for the same
 * reason the repository keeps it: an unselectable category is worse than an
 * oddly-placed one.
 */
export function toCategoryOptionGroups(
  categories: readonly CategoryOption[],
): CategoryOptionGroup[] {
  const groups: CategoryOptionGroup[] = [];
  const byParentId = new Map<string, CategoryOptionGroup>();

  const topLevelIds = new Set(categories.filter((c) => c.parentId === null).map((c) => c.id));

  for (const category of categories) {
    const isTopLevel = category.parentId === null || !topLevelIds.has(category.parentId);

    if (isTopLevel) {
      const group: CategoryOptionGroup = { parent: category, children: [] };
      groups.push(group);
      byParentId.set(category.id, group);
    } else {
      byParentId.get(category.parentId!)?.children.push(category);
    }
  }

  return groups;
}
