/**
 * #1323 — what `scripts/migrate-to-new-neon.ts` copies, as data, with no I/O.
 *
 * The move to a new Neon account fills a fresh database from the old STAGING one. Every decision
 * about WHICH rows travel lives here, so it can be read in one place and tested without a
 * database (spec: specs/2026-10-29-merqify-platform-move/, R9-R15).
 *
 * WHY EVERY MODEL IS LISTED, INCLUDING THE SKIPPED ONES. A copy driven by "the models I remembered"
 * silently drops whatever was added after it was written, and a copy driven by "every model" leaks
 * test orders, sessions and logs into a clean database. `tests/neon-migration-plan.test.ts` parses
 * `prisma/schema.prisma` and fails when a model is missing here, listed twice, or no longer exists,
 * so a new model forces a decision instead of defaulting either way.
 */

import { DEMO_EMAILS, LEGACY_DEMO_EMAILS } from "./demo-roster";

export type Classification = "copy" | "copy-filtered" | "skip";

/**
 * One entry per Prisma model. `copy-filtered` means a per-model rule below decides row by row, or
 * that rows are dropped because a parent they need was not copied (R12, R12a). Foreign keys are
 * enforced for EVERY copied model regardless of its class; the class says whether a model has a
 * rule of its own.
 */
export const MODEL_PLAN: Record<string, { class: Classification; reason: string }> = {
  // Identity: real people only, never the demo roster or @example.com test users (R14, #1356).
  User: { class: "copy-filtered", reason: "only users isDemoEmail() does not match" },
  Account: { class: "copy-filtered", reason: "only for copied users (sign-in credentials)" },
  Session: { class: "skip", reason: "sessions are re-created at sign-in" },
  Verification: { class: "skip", reason: "short-lived verification tokens" },
  VendorMembership: { class: "copy-filtered", reason: "only when user and vendor are copied" },

  // Stores and their settings (R13).
  Vendor: { class: "copy-filtered", reason: "only aheed-food-centre and srimart" },
  VendorDomain: { class: "skip", reason: "regenerated for the new merqify.com hosts (R15)" },
  VendorInboundAddress: { class: "skip", reason: "per-environment addresses (#1217)" },
  VendorBranding: { class: "copy", reason: "store settings" },
  VendorConfig: { class: "copy", reason: "store settings" },
  VendorLocation: { class: "copy", reason: "store settings" },
  VendorDeliveryArea: { class: "copy", reason: "store settings" },
  VendorFulfilmentSlot: { class: "copy", reason: "store settings" },
  VendorWeeklyHours: { class: "copy", reason: "store settings" },
  VendorHoursOverride: { class: "copy", reason: "store settings" },
  VendorExpressSchedule: { class: "copy", reason: "store settings" },
  VendorPaymentBadge: { class: "copy", reason: "store settings" },
  VendorLoyaltyTier: { class: "copy", reason: "store settings" },
  VendorReviewLink: { class: "copy", reason: "store settings" },
  VendorFaq: { class: "copy", reason: "store settings" },
  VendorTheme: { class: "copy", reason: "store settings" },
  Theme: { class: "copy", reason: "platform themes" },
  VendorAttribute: { class: "copy", reason: "catalogue structure" },
  VendorAttributeOption: { class: "copy", reason: "catalogue structure" },

  // Catalogue (R11, R12).
  Brand: { class: "copy", reason: "catalogue structure" },
  Category: { class: "copy", reason: "catalogue structure" },
  CategoryAsset: { class: "copy", reason: "catalogue structure" },
  DepartmentCampaign: { class: "copy", reason: "catalogue structure" },
  SearchSynonym: { class: "copy", reason: "search configuration" },
  DiscountCode: { class: "copy", reason: "store offers (a skipped referral owner is nulled)" },
  Product: { class: "copy-filtered", reason: "10% sample: hand-seeded plus every tenth gen-" },
  ProductImage: { class: "copy-filtered", reason: "only for copied products" },
  ProductPriceTier: { class: "copy-filtered", reason: "only for copied products" },
  ProductAttributeValue: { class: "copy-filtered", reason: "only for copied products" },
  Inventory: { class: "copy-filtered", reason: "only for copied products" },
  Bundle: { class: "copy-filtered", reason: "only when at least one item's product is copied" },
  BundleItem: { class: "copy-filtered", reason: "only for copied products" },

  // Test checkouts and shopper activity: the platform has never traded (R10).
  Cart: { class: "skip", reason: "test shopper data" },
  CartItem: { class: "skip", reason: "test shopper data" },
  Order: { class: "skip", reason: "test checkouts" },
  OrderItem: { class: "skip", reason: "test checkouts" },
  Payment: { class: "skip", reason: "test checkouts" },
  OrderStatusEvent: { class: "skip", reason: "test checkouts" },
  PaymentReconciliation: { class: "skip", reason: "test checkouts" },
  PaymentBindingRefusal: { class: "skip", reason: "test checkouts" },
  DiscountRedemption: { class: "skip", reason: "test checkouts" },
  LoyaltyLedgerEntry: { class: "skip", reason: "test shopper data" },
  LoyaltyAccount: { class: "skip", reason: "test shopper data" },
  MarketingConsentEvent: { class: "skip", reason: "test shopper data" },
  Review: { class: "skip", reason: "test shopper data" },
  Favourite: { class: "skip", reason: "test shopper data" },
  CustomerFeedback: { class: "skip", reason: "test shopper data" },
  ShoppingList: { class: "skip", reason: "test shopper data" },
  ShoppingListItem: { class: "skip", reason: "test shopper data" },
  Address: { class: "skip", reason: "test shopper data" },
  CustomerAddress: { class: "skip", reason: "test shopper data" },

  // Logs, audit trails, counters and rate-limit attempts.
  HealthCheck: { class: "skip", reason: "health probe rows" },
  ErrorEvent: { class: "skip", reason: "log" },
  SearchQueryLog: { class: "skip", reason: "log" },
  AiUsageEvent: { class: "skip", reason: "log" },
  AssistantConversation: { class: "skip", reason: "log" },
  ProductRestrictionAuditLog: { class: "skip", reason: "audit log of the old database" },
  VendorRoleAuditLog: { class: "skip", reason: "audit log of the old database" },
  NetContentSuggestion: { class: "skip", reason: "review queue of the old catalogue" },
  DeliveryRefusalCount: { class: "skip", reason: "counter" },
  OrderLookupAttempt: { class: "skip", reason: "rate-limit attempts" },
  DiscountCodeAttempt: { class: "skip", reason: "rate-limit attempts" },
  AuthenticationAttempt: { class: "skip", reason: "rate-limit attempts" },
  CustomerFeedbackAttempt: { class: "skip", reason: "rate-limit attempts" },
  ListNormalisationAttempt: { class: "skip", reason: "rate-limit attempts" },
};

export type Target = "staging" | "production";

/** Owner decision 2026-10-29: Aheed Superstore is retired; both targets get exactly these. */
export const VENDOR_SLUGS: Record<Target, readonly string[]> = {
  staging: ["aheed-food-centre", "srimart"],
  production: ["aheed-food-centre", "srimart"],
};

/**
 * The `Vendor` that `prisma/migrations/20260808130000_multitenancy_vendor_scope/migration.sql`
 * inserts into EVERY migrated database (R8a). A migrated target therefore is never empty, so the
 * emptiness check has to recognise this one row, and only this one, as acceptable.
 */
export const SEEDED_VENDOR = {
  id: "a4ed0000-0000-4000-a000-000000000001",
  slug: "aheed-food-centre",
} as const;

export type TargetVendorState = "empty" | "seeded-only" | "occupied";

/**
 * R8a — what a target's `Vendor` rows say about it. `seeded-only` needs exactly one row whose id
 * AND slug both match the migration's, so a row that matches only one of them (a lookalike, or a
 * real store that happens to reuse the slug) is `occupied`.
 */
export function classifyTargetVendors(
  rows: ReadonlyArray<{ id: string; slug: string }>,
): TargetVendorState {
  if (rows.length === 0) return "empty";
  if (rows.length === 1 && rows[0].id === SEEDED_VENDOR.id && rows[0].slug === SEEDED_VENDOR.slug) {
    return "seeded-only";
  }
  return "occupied";
}

/**
 * R8b — every `model.field` that holds a foreign key to `Vendor`, read from the schema. The
 * seeded vendor may only be replaced when none of these reference it: many of these keys cascade
 * on delete, so removing a vendor that owns rows would delete them without a word.
 */
export function vendorDependents(
  models: Record<string, ForeignKey[]>,
): Array<{ model: string; field: string }> {
  const out: Array<{ model: string; field: string }> = [];
  for (const model of Object.keys(models).sort()) {
    for (const fk of models[model]) {
      if (fk.target === "Vendor" && fk.fields.length === 1) {
        out.push({ model, field: fk.fields[0] });
      }
    }
  }
  return out;
}

/** The `VendorDomain` rows a target gets, one canonical host per store (R1, R2, R15). */
export const VENDOR_HOSTS: Record<Target, Record<string, string>> = {
  staging: {
    "aheed-food-centre": "aheed-staging.merqify.com",
    srimart: "srimart-staging.merqify.com",
  },
  production: {
    "aheed-food-centre": "aheed.merqify.com",
    srimart: "srimart.merqify.com",
  },
};

const DEMO_ROSTER = new Set([...DEMO_EMAILS, ...LEGACY_DEMO_EMAILS]);

/**
 * Demo and test accounts. Never copied: their roles on old staging are stale; the roster is re-created with `demo:accounts add` (R14).
 * #1356 — the roster is matched by its exact addresses (new `@merqify.com` and legacy `@example.com`), never by the
 * `merqify.com` domain, so a real Merqify person is copied and can be granted a role. Any other `@example.com`
 * address is still a test account.
 */
export function isDemoEmail(email: string): boolean {
  const normalised = email.trim().toLowerCase();
  return DEMO_ROSTER.has(normalised) || normalised.endsWith("@example.com");
}

const GENERATED_PREFIX = "gen-";

/**
 * The 10% product sample (R11). Generated slugs are `gen-<index>-<noun>` with index 0-1999
 * (`prisma/generate-catalogue.ts`); every tenth is kept, so 200 of the 2,000. Hand-seeded products
 * are few and curated, so all of them are kept. A `gen-` slug whose index is not an integer is
 * dropped: it is not a shape the generator produces, so it is not counted as part of the sample.
 */
export function isSelectedProductSlug(slug: string): boolean {
  if (!slug.startsWith(GENERATED_PREFIX)) return true;
  const index = slug.slice(GENERATED_PREFIX.length).split("-", 1)[0];
  if (!/^\d+$/.test(index)) return false;
  return Number(index) % 10 === 0;
}

export function selectProducts<T extends { slug: string }>(products: readonly T[]): T[] {
  return products.filter((p) => isSelectedProductSlug(p.slug));
}

/**
 * Every column holding an R2 object key (ADR-003: relative keys, never URLs). `--copy-images`
 * copies the object behind each non-null value on a copied row (R18).
 */
export const IMAGE_KEY_FIELDS: ReadonlyArray<{ model: string; field: string }> = [
  { model: "Brand", field: "imageKey" },
  { model: "VendorBranding", field: "logoStorageKey" },
  { model: "VendorBranding", field: "markStorageKey" },
  { model: "VendorConfig", field: "whatsappCommunityQrKey" },
  { model: "Category", field: "imageKey" },
  { model: "DepartmentCampaign", field: "imageKey" },
  { model: "CategoryAsset", field: "storageKey" },
  { model: "Bundle", field: "imageKey" },
  { model: "ProductImage", field: "storageKey" },
];

/** A seeded placeholder key, which can be restored from `prisma/seed-assets` when missing (R18). */
export function isPlaceholderKey(key: string): boolean {
  return /^products\/[^/]+\/main\.svg$/.test(key);
}

/** One model's relations, as the copy needs them: which scalar columns point at which model. */
export type ForeignKey = {
  fields: string[];
  references: string[];
  target: string;
  required: boolean;
};

/**
 * Every model's foreign keys, read from `prisma/schema.prisma` text.
 *
 * WHY NOT `Prisma.dmmf`: with `engineType = "client"` the generated client's runtime data model
 * carries no relation or primary-key detail (measured at #1323's build: zero relations, zero `@id`
 * fields across all 69 models), so a copy driven by it would see no foreign keys at all and insert
 * children before parents. The schema file is the authority, and parsing it keeps this testable.
 *
 * A key is `required` when every scalar it uses is declared without `?`.
 */
export function parseForeignKeys(schema: string): Record<string, ForeignKey[]> {
  const result: Record<string, ForeignKey[]> = {};
  for (const block of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [, name, body] = block;
    const lines = body.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "").trim());
    const optional = new Map<string, boolean>();
    for (const line of lines) {
      const m = /^(\w+)\s+(\w+)(\?|\[\])?/.exec(line);
      if (m) optional.set(m[1], m[3] === "?");
    }
    const fks: ForeignKey[] = [];
    for (const line of lines) {
      const field = /^(\w+)\s+(\w+)\??\s+.*@relation\(([^)]*)\)/.exec(line);
      if (!field) continue;
      const fromFields = /fields:\s*\[([^\]]*)\]/.exec(field[3]);
      const toFields = /references:\s*\[([^\]]*)\]/.exec(field[3]);
      if (!fromFields || !toFields) continue;
      const split = (s: string) =>
        s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      const fields = split(fromFields[1]);
      fks.push({
        fields,
        references: split(toFields[1]),
        target: field[2],
        required: fields.every((f) => optional.get(f) === false),
      });
    }
    result[name] = fks;
  }
  return result;
}

/**
 * Dependency order for inserting rows: every model after the models its foreign keys point at.
 * Self-references (a category's parent) are ignored here and handled by row order within the
 * model. Throws on a cycle between two models, which no insert order can satisfy.
 */
export function insertOrder(models: Record<string, ForeignKey[]>): string[] {
  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string, path: string[]) => {
    const s = state.get(name);
    if (s === "done") return;
    if (s === "visiting") throw new Error(`foreign-key cycle: ${[...path, name].join(" -> ")}`);
    state.set(name, "visiting");
    for (const fk of models[name] ?? []) {
      if (fk.target !== name && fk.target in models) visit(fk.target, [...path, name]);
    }
    state.set(name, "done");
    order.push(name);
  };
  for (const name of Object.keys(models).sort()) visit(name, []);
  return order;
}

export type Row = Record<string, unknown>;

/**
 * Apply the foreign-key rule (R12a) to one row, given the key values already copied per model.
 * Returns the row to insert (with nullable keys to missing parents set to null), or null when a
 * required key points at a row that was not copied.
 */
export function applyForeignKeys(
  row: Row,
  fks: readonly ForeignKey[],
  copied: (model: string, field: string, value: unknown) => boolean,
): { row: Row | null; nulled: number } {
  let out: Row = row;
  let nulled = 0;
  for (const fk of fks) {
    const values = fk.fields.map((f) => row[f]);
    if (values.some((v) => v === null || v === undefined)) continue;
    const present = fk.fields.every((_, i) => copied(fk.target, fk.references[i], values[i]));
    if (present) continue;
    if (fk.required) return { row: null, nulled };
    if (out === row) out = { ...row };
    for (const f of fk.fields) out[f] = null;
    nulled += 1;
  }
  return { row: out, nulled };
}
