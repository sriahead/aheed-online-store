import type { getPrisma } from "@/lib/db";
import type { MarketingConsentSource } from "@prisma/client/wasm";

/**
 * Marketing consent records (#1134). Every export takes its client and `vendorId`/`userId`
 * explicitly and reads no request context (`tests/repository-purity.test.ts`), so a plain `tsx`
 * script can exercise it. The request-scoped facade is `lib/marketing-consent-service.ts`.
 *
 * The table is an append-only log: the newest event for (vendorId, userId) is the current state,
 * and no event means not opted in.
 */

/** A Prisma client or an interactive-transaction client — every function works on either. */
type Client = ReturnType<typeof getPrisma>;
type Tx = Parameters<Parameters<Client["$transaction"]>[0]>[0];
type Db = Client | Tx;

export interface MarketingConsentState {
  granted: boolean;
  statement: string;
  source: MarketingConsentSource;
  createdAt: Date;
}

/**
 * Appends one choice. A singular `create` with no nested writes, so it opens no implicit
 * transaction and is safe over `getPrisma()` (CLAUDE.md, Database).
 */
export async function recordMarketingConsent(
  prisma: Db,
  vendorId: string,
  userId: string,
  input: { granted: boolean; statement: string; source: MarketingConsentSource },
): Promise<void> {
  await prisma.marketingConsentEvent.create({
    data: {
      vendorId,
      userId,
      granted: input.granted,
      statement: input.statement,
      source: input.source,
    },
  });
}

/** The newest choice for this user at this vendor, or `null` if they have never made one. */
export async function getMarketingConsentState(
  prisma: Db,
  vendorId: string,
  userId: string,
): Promise<MarketingConsentState | null> {
  return prisma.marketingConsentEvent.findFirst({
    where: { vendorId, userId },
    orderBy: { createdAt: "desc" },
    select: { granted: true, statement: true, source: true, createdAt: true },
  });
}

/**
 * The ONE check a future marketing sender must make: the newest choice is a grant AND the user's
 * email is verified. A sign-up can name an address the person does not own, so consent given
 * before verification is recorded but not effective until the owner of the address confirms it.
 */
export async function hasEffectiveMarketingConsent(
  prisma: Db,
  vendorId: string,
  userId: string,
): Promise<boolean> {
  const [state, user] = await Promise.all([
    getMarketingConsentState(prisma, vendorId, userId),
    prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } }),
  ]);
  return state?.granted === true && user?.emailVerified === true;
}
