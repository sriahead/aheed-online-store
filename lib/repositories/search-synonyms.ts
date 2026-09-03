import type { getPrisma, getPrismaWs } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";

/**
 * The vendor's curated search alias dictionary (P2.6 slice 3, #566, closing #396) — the ONLY DB
 * access for synonyms. Pages, components and feature actions reach it through
 * `lib/search-synonyms-service.ts` (ADR-004 slice-2 no-direct-Prisma guard).
 *
 * Every export takes `prisma` and `vendorId` as explicit parameters and reads no request context
 * (#252), so a plain `tsx` script can exercise any of it against a real database without a live
 * Workers request. `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts`
 * both enforce that, whole-directory and with no allowlist.
 *
 * WHICH CLIENT. Everything here is a singular `create`/`update`/`delete` or a read, so the normal
 * HTTP client is correct — EXCEPT `createProposedSynonyms`, which uses `createMany` and therefore
 * needs a transaction-capable client (#382: Prisma's query compiler wraps `createMany` in an
 * internal transaction the HTTP adapter cannot execute, regardless of row count). Its parameter is
 * named and typed for `getPrismaWs()` accordingly, and
 * `tests/repository-transaction-safety.test.ts` checks the call sites rather than trusting the name.
 */

export type SynonymStatus = "PENDING" | "APPROVED" | "REJECTED";
export type SynonymSource = "SEED" | "STAFF" | "AI";

export interface SearchSynonymRow {
  id: string;
  alias: string;
  canonical: string;
  status: SynonymStatus;
  source: SynonymSource;
  createdAt: Date;
}

/**
 * Upper bound on the rows any one query here reads.
 *
 * The approved-alias map is loaded on EVERY storefront search, so an unbounded read would make a
 * vendor with a large dictionary pay for it on the hottest path in the app. A realistic curated
 * grocery dictionary is dozens of rows; five hundred is far past that and still a trivial fetch.
 * Applied to the staff listing too, which has no pagination of its own.
 */
export const SYNONYM_LOAD_LIMIT = 500;

/** Aliases are matched case-insensitively, so they are stored folded rather than as typed. */
export function normaliseSynonymTerm(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The alias → canonical map used to expand a shopper's query.
 *
 * APPROVED ONLY. A `PENDING` row is an AI proposal no human has looked at yet and a `REJECTED` one
 * is a human's explicit "no"; neither may widen a shopper's query. This is the single place that
 * decision is enforced, which is why `lib/search-expansion.ts` takes a map rather than a status.
 */
export async function listApprovedAliasMap(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<Map<string, string>> {
  const rows = await prisma.searchSynonym.findMany({
    where: { vendorId, status: "APPROVED" },
    select: { alias: true, canonical: true },
    take: SYNONYM_LOAD_LIMIT,
  });

  return new Map(rows.map((row) => [row.alias, row.canonical]));
}

/** Every synonym for the staff dictionary page, pending first so the approval queue leads. */
export async function listSynonymsForVendor(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<SearchSynonymRow[]> {
  return prisma.searchSynonym.findMany({
    where: { vendorId },
    select: {
      id: true,
      alias: true,
      canonical: true,
      status: true,
      source: true,
      createdAt: true,
    },
    orderBy: [{ status: "asc" }, { alias: "asc" }],
    take: SYNONYM_LOAD_LIMIT,
  });
}

export type SynonymWriteResult =
  | { ok: true }
  | { ok: false; error: string; field: "alias" | "canonical" | null };

/**
 * Add one synonym.
 *
 * The duplicate-alias case is a FORM ERROR, not a 500. `isUniqueViolation` covers both adapter
 * shapes — the HTTP adapter behind `getPrisma()` raises the raw SQLSTATE `23505` while the
 * WebSocket adapter normalises to Prisma's `P2002` — which is the gap that 500ed a real
 * duplicate-slug submission in #347.
 */
export async function createSynonym(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  input: { alias: string; canonical: string; status?: SynonymStatus; source?: SynonymSource },
): Promise<SynonymWriteResult> {
  const alias = normaliseSynonymTerm(input.alias);
  const canonical = normaliseSynonymTerm(input.canonical);

  const invalid = validateSynonymPair(alias, canonical);
  if (invalid) return invalid;

  try {
    await prisma.searchSynonym.create({
      data: {
        vendorId,
        alias,
        canonical,
        // A synonym a store admin types is approved on the spot — they ARE the approver. The
        // PENDING state exists for AI proposals, which arrive via createProposedSynonyms.
        status: input.status ?? "APPROVED",
        source: input.source ?? "STAFF",
      },
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: `"${alias}" is already in this dictionary.`, field: "alias" };
    }
    throw error;
  }
}

/** Shared shape rules, so the staff form and the AI proposal path cannot disagree on what is valid. */
export function validateSynonymPair(
  alias: string,
  canonical: string,
): { ok: false; error: string; field: "alias" | "canonical" | null } | null {
  if (alias.length === 0) return { ok: false, error: "Enter the word shoppers type.", field: "alias" };
  if (canonical.length === 0) {
    return { ok: false, error: "Enter the word your catalogue uses.", field: "canonical" };
  }
  if (alias === canonical) {
    return {
      ok: false,
      error: "The two words are the same, so this mapping would do nothing.",
      field: "canonical",
    };
  }
  return null;
}

/** Edit an existing row. Scoped by `vendorId` so a caller cannot reach another tenant's dictionary. */
export async function updateSynonym(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
  input: { alias: string; canonical: string },
): Promise<SynonymWriteResult> {
  const alias = normaliseSynonymTerm(input.alias);
  const canonical = normaliseSynonymTerm(input.canonical);

  const invalid = validateSynonymPair(alias, canonical);
  if (invalid) return invalid;

  const existing = await prisma.searchSynonym.findFirst({ where: { id, vendorId }, select: { id: true } });
  if (!existing) return { ok: false, error: "That entry no longer exists.", field: null };

  try {
    await prisma.searchSynonym.update({ where: { id }, data: { alias, canonical } });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: `"${alias}" is already in this dictionary.`, field: "alias" };
    }
    throw error;
  }
}

/** Approve or reject a proposal — the only transition the staff queue offers. */
export async function setSynonymStatus(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
  status: SynonymStatus,
): Promise<SynonymWriteResult> {
  const existing = await prisma.searchSynonym.findFirst({ where: { id, vendorId }, select: { id: true } });
  if (!existing) return { ok: false, error: "That entry no longer exists.", field: null };

  await prisma.searchSynonym.update({ where: { id }, data: { status } });
  return { ok: true };
}

export async function deleteSynonym(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
): Promise<SynonymWriteResult> {
  const existing = await prisma.searchSynonym.findFirst({ where: { id, vendorId }, select: { id: true } });
  if (!existing) return { ok: false, error: "That entry no longer exists.", field: null };

  await prisma.searchSynonym.delete({ where: { id } });
  return { ok: true };
}

/**
 * Write a batch of AI proposals as `PENDING` rows.
 *
 * `prismaWs` — NOT `getPrisma()`. `createMany` fails unconditionally over the HTTP adapter (#382),
 * including for a zero-row batch, because the query compiler opens a transaction of its own.
 *
 * `skipDuplicates` is what makes a re-run harmless: the model already knows an alias, so a proposal
 * repeating one the dictionary holds is dropped rather than raising a unique violation that would
 * abandon the rest of the batch.
 */
export async function createProposedSynonyms(
  prismaWs: ReturnType<typeof getPrismaWs>,
  vendorId: string,
  proposals: readonly { alias: string; canonical: string }[],
): Promise<number> {
  const rows = proposals
    .map((proposal) => ({
      alias: normaliseSynonymTerm(proposal.alias),
      canonical: normaliseSynonymTerm(proposal.canonical),
    }))
    .filter((row) => validateSynonymPair(row.alias, row.canonical) === null)
    .map((row) => ({ ...row, vendorId, status: "PENDING" as const, source: "AI" as const }));

  if (rows.length === 0) return 0;

  const result = await prismaWs.searchSynonym.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}
