import { getPrisma, getPrismaWs } from "@/lib/db";
import {
  createProposedSynonyms as createProposedSynonymsRepo,
  createSynonym as createSynonymRepo,
  deleteSynonym as deleteSynonymRepo,
  listSynonymsForVendor as listSynonymsForVendorRepo,
  setSynonymStatus as setSynonymStatusRepo,
  updateSynonym as updateSynonymRepo,
  type SearchSynonymRow,
  type SynonymStatus,
  type SynonymWriteResult,
} from "@/lib/repositories/search-synonyms";
import { listCurationCandidateQueries } from "@/lib/repositories/search-query-log";
import { listProductNameTokens } from "@/lib/repositories/products";
import {
  PROPOSAL_QUERY_LIMIT,
  proposeSynonyms,
} from "@/lib/search-synonym-proposals";

/**
 * Request-scoped wrapper around `lib/repositories/search-synonyms.ts` (P2.6 slice 3, #566) —
 * resolves a live Prisma client so the staff page and its server actions can reach the dictionary.
 *
 * Lives beside, not inside, `lib/repositories/`, matching `lib/campaigns-service.ts` and
 * `lib/data-rights-service.ts`: the repository's exports take `prisma`/`vendorId` explicitly and
 * read no request context, which is what lets a plain `tsx` script drive them. Every export here
 * exists because `app/**`, `features/**` and `components/**` are ESLint-forbidden from importing
 * `@/lib/db` at all.
 *
 * `vendorId` is a PARAMETER here rather than resolved from context: every caller is a staff surface
 * that already holds an authoritative one from `requireVendorRole`. The storefront read path does
 * not go through this file at all — `searchProducts` loads the alias map with the client and vendor
 * it was already given.
 *
 * Prisma is constructed fresh per call — never cached across requests.
 */

export async function listSynonymsForStaff(vendorId: string): Promise<SearchSynonymRow[]> {
  return listSynonymsForVendorRepo(getPrisma(), vendorId);
}

export async function createSynonym(
  vendorId: string,
  input: { alias: string; canonical: string },
): Promise<SynonymWriteResult> {
  return createSynonymRepo(getPrisma(), vendorId, input);
}

export async function updateSynonym(
  vendorId: string,
  id: string,
  input: { alias: string; canonical: string },
): Promise<SynonymWriteResult> {
  return updateSynonymRepo(getPrisma(), vendorId, id, input);
}

export async function setSynonymStatus(
  vendorId: string,
  id: string,
  status: SynonymStatus,
): Promise<SynonymWriteResult> {
  return setSynonymStatusRepo(getPrisma(), vendorId, id, status);
}

export async function deleteSynonym(vendorId: string, id: string): Promise<SynonymWriteResult> {
  return deleteSynonymRepo(getPrisma(), vendorId, id);
}

/**
 * `getPrismaWs()`, NOT `getPrisma()` — the repository call underneath uses `createMany`, which the
 * HTTP adapter cannot execute at all (#382). `tests/repository-transaction-safety.test.ts` is what
 * would catch this being changed back.
 */
export async function createProposedSynonyms(
  vendorId: string,
  proposals: readonly { alias: string; canonical: string }[],
): Promise<number> {
  return createProposedSynonymsRepo(getPrismaWs(), vendorId, proposals);
}

/**
 * The staff-triggered AI proposal run (#566): read this vendor's own failing searches, ask the
 * model to map them onto the catalogue's vocabulary, and write what comes back as `PENDING` rows.
 *
 * Every step is vendor-scoped, and the write is `PENDING`/`AI` — so the worst case of a bad model
 * response is a staff member rejecting some rows, never a shopper seeing a wrong result. Reachable
 * only from `/staff/search-synonyms` behind `requireVendorRole("ADMIN")` (#571).
 */
export async function generateSynonymProposals(
  vendorId: string,
): Promise<{ ok: true; created: number; considered: number } | { ok: false; error: string }> {
  const prisma = getPrisma();

  const [queries, vocabulary] = await Promise.all([
    listCurationCandidateQueries(prisma, vendorId, PROPOSAL_QUERY_LIMIT),
    listProductNameTokens(prisma, vendorId),
  ]);

  const result = await proposeSynonyms(queries, [...vocabulary]);
  if (!result.ok) return result;

  const created = await createProposedSynonyms(vendorId, result.proposals);
  return { ok: true, created, considered: queries.length };
}
