import { getPrisma } from "@/lib/db";
import { isUniqueViolation } from "./prisma-errors";
import { listProductsByIds, type ProductSummary } from "./products";

type Db = ReturnType<typeof getPrisma>;

/**
 * Favourites (#232) — the products a shopper wants to come back to, per vendor.
 *
 * NO `getPrismaWs()` ANYWHERE IN THIS FILE, deliberately. CLAUDE.md's rule is "does this open an
 * implicit transaction", not "which method is named": a singular `create` with no nested writes, a
 * `deleteMany` and the reads below all run safely on the HTTP client. Nothing here is interactive,
 * so nothing needs a socket. A later reader should not "fix" this to the WebSocket client — that
 * would spend an isolate's socket budget for no reason.
 *
 * Every export takes its client plus `vendorId` and `userId` explicitly and reads no request
 * context, so `scripts/verify-favourites.ts` can exercise all of it in plain Node against a real
 * database. That is not incidental — it is the only way the duplicate-key behaviour below is proved
 * against a real error rather than a hand-built double. `tests/repository-purity.test.ts` and
 * `tests/repository-client-injection.test.ts` enforce the property without an allowlist.
 */

export type FavouriteToggleOutcome = "added" | "removed";

export interface FavouriteRepository {
  listProducts(userId: string): Promise<ProductSummary[]>;
  listProductIds(userId: string): Promise<Set<string>>;
  toggle(userId: string, productId: string): Promise<FavouriteToggleOutcome>;
}

/**
 * Add a favourite, reporting whether it was already there.
 *
 * THE UNIQUE CONSTRAINT IS THE CONCURRENCY CONTROL. Two taps racing each other both reach the
 * `create`; the loser violates `@@unique([vendorId, userId, productId])`. That is a SUCCESS, not an
 * error — the product ends up favourited either way, which is the only thing the shopper asked for.
 * Swallowing it here is what makes the toggle idempotent.
 *
 * `isUniqueViolation` is the SHARED predicate (`./prisma-errors`), not a local copy, because the
 * two adapters report this same Postgres error under different `.code` values — raw SQLSTATE
 * `"23505"` through the HTTP client and Prisma's `P2002` through the WebSocket one. That module's
 * docstring records that a second copy of those literals is how two call sites drift, and
 * `scripts/verify-favourites.ts` observes a real one rather than trusting this comment.
 */
export async function addFavourite(
  prisma: Db,
  vendorId: string,
  userId: string,
  productId: string,
): Promise<void> {
  try {
    await prisma.favourite.create({ data: { vendorId, userId, productId } });
  } catch (error) {
    if (isUniqueViolation(error)) return;
    throw error;
  }
}

/**
 * Remove a favourite. `deleteMany` rather than `delete` so removing something already gone is not
 * an error — the same idempotence the add path has, from the other direction.
 */
export async function removeFavourite(
  prisma: Db,
  vendorId: string,
  userId: string,
  productId: string,
): Promise<void> {
  await prisma.favourite.deleteMany({ where: { vendorId, userId, productId } });
}

/**
 * Flip the favourite state for one product and report where it landed.
 *
 * Read-then-write, NOT a transaction: the read only decides which direction to go, and both
 * directions are idempotent, so the worst a concurrent toggle can do is land on the state the other
 * tap asked for. Wrapping it in an interactive transaction would need `getPrismaWs()` and buy
 * nothing — there is no invariant spanning the two statements.
 */
export async function toggleFavourite(
  prisma: Db,
  vendorId: string,
  userId: string,
  productId: string,
): Promise<FavouriteToggleOutcome> {
  const existing = await prisma.favourite.findUnique({
    where: { vendorId_userId_productId: { vendorId, userId, productId } },
    select: { id: true },
  });

  if (existing) {
    await removeFavourite(prisma, vendorId, userId, productId);
    return "removed";
  }

  await addFavourite(prisma, vendorId, userId, productId);
  return "added";
}

/**
 * This shopper's favourited product ids for this vendor.
 *
 * ONE QUERY PER PAGE RENDER, not one per card: the listing pages resolve this set once and hand each
 * `ProductCard` a boolean, the same shape `cartQuantity` already uses. Returned as a `Set` because
 * every caller does membership tests.
 */
export async function listFavouriteProductIds(
  prisma: Db,
  vendorId: string,
  userId: string,
): Promise<Set<string>> {
  const rows = await prisma.favourite.findMany({
    where: { vendorId, userId },
    select: { productId: true },
  });
  return new Set(rows.map((row) => row.productId));
}

/**
 * This shopper's favourited products, newest first — the `/account/favourites` listing.
 *
 * TWO STEPS, NOT A JOIN. This reads the favourite rows for their ORDER, then hands the ids to
 * `listProductsByIds`, which owns the product summary shape and the multi-buy tier lookup. A
 * `select: { product: { select: ... } }` join here would have to restate that shape, and a
 * favourited product would then render differently from the same product on `/categories` — the
 * tier badge being the first thing to go missing.
 *
 * A favourite whose product is now inactive or sits in a hidden department is dropped by
 * `listProductsByIds` rather than rendered as a gap. The row survives, so re-activating the product
 * brings the favourite back; this is also why the empty state can be reached with rows still in the
 * table. Reconciling those rows is out of scope (see `plan.md`, and the open `#1139`).
 *
 * Unbounded, matching how `/bundles` lists every active bundle.
 * `@@index([vendorId, userId, createdAt])` is what makes adding a cursor later a change to this
 * function and nothing else.
 */
export async function listFavouriteProducts(
  prisma: Db,
  vendorId: string,
  userId: string,
): Promise<ProductSummary[]> {
  const rows = await prisma.favourite.findMany({
    where: { vendorId, userId },
    orderBy: { createdAt: "desc" },
    select: { productId: true },
  });

  return listProductsByIds(
    prisma,
    vendorId,
    rows.map((row) => row.productId),
  );
}
