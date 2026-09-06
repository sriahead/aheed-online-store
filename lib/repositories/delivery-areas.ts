// Type-only: a value import of "@prisma/client/wasm" is unresolvable under vitest
// (see tests/orders.test.ts), and this file needs nothing from it at runtime.
import type { Prisma } from "@prisma/client/wasm";
import type { getPrisma, getPrismaWs } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import type { CatalogueWriteResult } from "@/lib/repositories/products";

/**
 * Vendor delivery areas (P9.2, #612) — the ONLY DB access for `VendorDeliveryArea`.
 *
 * These rows are a hard checkout gate: `features/checkout/place-order.ts` refuses an order outright
 * when `lib/delivery.ts`'s `isDeliverable()` finds no matching prefix. Until this slice their only
 * writer anywhere in the repository was `prisma/seed.ts`, so a vendor's delivery footprint was a
 * developer-only setting on the revenue path.
 *
 * Every export takes `prisma` and `vendorId` as EXPLICIT parameters and reads no request context
 * (#252, #409/#411/#412). That is what lets a plain `tsx` script exercise this module in real Node
 * — `lib/db.ts` builds its client from `@prisma/client/wasm`, whose query compiler Node cannot
 * load, so a function resolving its own client could not be run outside a Workers request at all.
 * The request-scoped facade lives in `lib/delivery-areas-service.ts`, beside this file rather than
 * inside it; `tests/repository-purity.test.ts` enforces the location and
 * `tests/repository-client-injection.test.ts` enforces the injection.
 *
 * WHY ONLY `remove` TAKES THE WEBSOCKET CLIENT. This is a deliberate divergence from
 * `lib/repositories/brands.ts`, which this module otherwise follows closely. Brands needs `DbWs`
 * for `rename`/`setImageKey` because both use `updateMany`, and `updateMany`/`createMany` crash
 * unconditionally through the HTTP adapter `getPrisma()` returns (#382). A delivery area is only
 * ever added or removed, never edited, so there is no `updateMany` here at all. `remove` reaches
 * for `getPrismaWs()` for a different reason entirely — an interactive transaction, which
 * `PrismaNeonHttp` also cannot execute — and `list`/`create` use the ordinary client.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;

export interface DeliveryAreaRow {
  id: string;
  prefix: string;
}

export interface DeliveryAreaRepository {
  list(): Promise<DeliveryAreaRow[]>;
  create(prefix: string): Promise<CatalogueWriteResult>;
  remove(id: string): Promise<CatalogueWriteResult>;
}

const DUPLICATE: CatalogueWriteResult = {
  ok: false,
  error: "That postcode area is already on the delivery list.",
  field: "prefix",
};

const NOT_FOUND: CatalogueWriteResult = {
  ok: false,
  error: "That delivery area no longer exists.",
  field: "id",
};

const LAST_REMAINING: CatalogueWriteResult = {
  ok: false,
  error:
    "This is the only delivery area left. Removing it would stop every customer from checking out, so add another area first.",
  field: "id",
};

/** The vendor's delivery areas, alphabetically — the staff list and nothing else reads this. */
export async function listDeliveryAreasForVendor(
  prisma: Db,
  vendorId: string,
): Promise<DeliveryAreaRow[]> {
  return prisma.vendorDeliveryArea.findMany({
    where: { vendorId },
    orderBy: { prefix: "asc" },
    select: { id: true, prefix: true },
  });
}

/**
 * Add a postcode area to the vendor's delivery footprint.
 *
 * The caller is responsible for having run `parsePrefixInput` first — see that function's header
 * for why an unvalidated string reaching this column is a checkout-path hazard rather than a
 * cosmetic one.
 *
 * `isUniqueViolation` covers BOTH driver error codes. The HTTP adapter that `getPrisma()` returns
 * surfaces a duplicate as the raw SQLSTATE `23505` while the WebSocket adapter normalises it to
 * Prisma's `P2002`, and checking only one is how `upsertBundle` 500ed on a real duplicate
 * submission (CLAUDE.md's database section). `@@unique([vendorId, prefix])` is what raises it.
 */
export async function createDeliveryAreaForVendor(
  prisma: Db,
  vendorId: string,
  prefix: string,
): Promise<CatalogueWriteResult> {
  try {
    const created = await prisma.vendorDeliveryArea.create({
      data: { vendorId, prefix },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE;
    throw error;
  }
}

/**
 * Remove a delivery area, refusing to remove the vendor's last one.
 *
 * WHY THE GUARD EXISTS. Deleting the final area leaves `isDeliverable()` with an empty prefix list,
 * which returns false for every postcode — so checkout stops working for every customer of that
 * vendor, silently, from a settings screen. A vendor genuinely wanting to pause all delivery
 * deserves an explicit control for it, not this as an emergent side effect of emptying a list.
 *
 * WHY SERIALIZABLE. The count and the delete it guards have to be read-and-acted-on as one unit:
 * two admins each removing a different area, both reading "2 remaining", would both proceed and
 * leave the vendor with zero. Postgres aborts the loser with a serialization failure instead. This
 * mirrors `lib/repositories/roles.ts`'s last-admin guard, including its isolation level, and for
 * the same stated reason — the guard depends on an aggregate over OTHER rows, so the atomic
 * compare-and-set `updateMany` used by the stock, points and discount-usage guards is not available
 * here.
 *
 * Scoped by `vendorId` in both the count and the delete, so one vendor cannot remove another's area
 * even given a valid id — the guard lives in the query, not in which host served the page.
 */
export async function removeDeliveryAreaForVendor(
  prismaWs: DbWs,
  vendorId: string,
  id: string,
): Promise<CatalogueWriteResult> {
  return prismaWs.$transaction(
    async (tx) => {
      const remaining = await tx.vendorDeliveryArea.count({ where: { vendorId } });
      if (remaining <= 1) return LAST_REMAINING;

      const deleted = await tx.vendorDeliveryArea.deleteMany({ where: { id, vendorId } });
      if (deleted.count === 0) return NOT_FOUND;

      return { ok: true, id };
    },
    { isolationLevel: "Serializable" satisfies Prisma.TransactionIsolationLevel },
  );
}
