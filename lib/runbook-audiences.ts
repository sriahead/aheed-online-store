/**
 * Which operator documents the staff runbook shows, and what each audience is called (#633, R1-R7).
 *
 * WHY THIS IS A SHARED MODULE RATHER THAN A LITERAL IN EACH FILE.
 *
 * `/staff/runbook` used to filter its articles TWICE, against two different vocabularies:
 * `app/(admin)/staff/runbook/page.tsx` kept `staff`/`store-admin`, and
 * `components/staff/RunbookClient.tsx` then re-filtered that result for `staff`/`admin`. Because
 * `Array.includes` is exact-element matching, `["store-admin"].includes("admin")` is false — so of
 * 152 articles exactly ONE rendered, and the UI's own "Admin" tab could never match anything
 * (#625). Each file was individually correct; the defect lived only in the relationship between
 * them, which is what no per-file review catches.
 *
 * So the vocabulary lives here once, and the client no longer filters by audience at all — the
 * server has already decided what this viewer may see. The tab list is DERIVED from the audiences
 * actually present in the delivered documents (`deriveAudienceTabs`), which is the part that makes
 * the defect class unrepeatable: a tab exists if and only if it has documents behind it, so a tab
 * that matches nothing cannot be rendered.
 *
 * Pure — no I/O, no request context, no React — so the whole rule surface is unit-testable with no
 * database and no rendering, the same split as `lib/staff-orders-query.ts` and `lib/order-status.ts`.
 */

/** Audiences any viewer who passes the runbook's `requireVendorRole("STAFF", "ADMIN")` gate sees. */
export const RUNBOOK_VENDOR_AUDIENCES = ["staff", "store-admin"] as const;

/**
 * Audiences shown ONLY to a platform admin (`auth.via === "platform-admin"`).
 *
 * The same reasoning as `/staff/errors` (#508): a per-vendor store admin also satisfies
 * `requireVendorRole("ADMIN")`, but platform-level material is not theirs to read. Without this,
 * `docs/platform-admin-guide/platform-admin-guide.md` is unreachable in-product by ANYONE — a
 * platform admin passes the page's role gate, but the vendor-audience filter excludes their own
 * guide.
 */
export const RUNBOOK_PLATFORM_AUDIENCES = ["platform-admin"] as const;

export type RunbookAudience =
  (typeof RUNBOOK_VENDOR_AUDIENCES)[number] | (typeof RUNBOOK_PLATFORM_AUDIENCES)[number];

/**
 * Display names. Deliberately NOT derived by title-casing the slug: "store-admin" would render as
 * "Store Admin" and "platform-admin" as "Platform Admin", and the panel's prose uses sentence case.
 * An audience admitted by `audiencesForViewer` with no entry here fails `tests/runbook-audience.test.ts`
 * (R7), which is what stops a newly admitted audience from rendering as a raw slug.
 */
export const RUNBOOK_AUDIENCE_LABELS: Record<RunbookAudience, string> = {
  staff: "Staff",
  "store-admin": "Store admin",
  "platform-admin": "Platform admin",
};

/** Canonical tab order. Audiences not present in the delivered documents are dropped, never shown. */
const AUDIENCE_ORDER: readonly RunbookAudience[] = [
  "staff",
  "store-admin",
  "platform-admin",
] as const;

/** The audiences this viewer is allowed to see at all. */
export function audiencesForViewer(isPlatformAdmin: boolean): readonly RunbookAudience[] {
  return isPlatformAdmin
    ? [...RUNBOOK_VENDOR_AUDIENCES, ...RUNBOOK_PLATFORM_AUDIENCES]
    : [...RUNBOOK_VENDOR_AUDIENCES];
}

/** Minimal shape this module needs; the real article type carries much more. */
export interface AudienceTagged {
  audience: string[];
}

/**
 * The server-side filter. This is the ONLY place documents are narrowed by audience — the client
 * renders whatever it is handed.
 */
export function docsForViewer<T extends AudienceTagged>(docs: T[], isPlatformAdmin: boolean): T[] {
  const allowed = audiencesForViewer(isPlatformAdmin) as readonly string[];
  return docs.filter((doc) =>
    Array.isArray(doc.audience) ? doc.audience.some((a) => allowed.includes(a)) : false,
  );
}

/**
 * The tab list, derived from what was actually delivered.
 *
 * Returns only audiences that at least one document carries, in canonical order. That is the
 * guarantee behind R3: every tab this returns selects a non-empty set, because it was built from
 * a non-empty set.
 */
export function deriveAudienceTabs(docs: AudienceTagged[]): RunbookAudience[] {
  const present = new Set(docs.flatMap((doc) => (Array.isArray(doc.audience) ? doc.audience : [])));
  return AUDIENCE_ORDER.filter((audience) => present.has(audience));
}

/** Documents carrying a given audience. */
export function docsWithAudience<T extends AudienceTagged>(docs: T[], audience: string): T[] {
  return docs.filter((doc) => Array.isArray(doc.audience) && doc.audience.includes(audience));
}

/** Human-readable name for a tab. */
export function audienceLabel(audience: RunbookAudience): string {
  return RUNBOOK_AUDIENCE_LABELS[audience];
}
