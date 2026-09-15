import type { getPrisma, getPrismaWs } from "@/lib/db";
import { formatPostcode, normalisePostcode } from "@/lib/postcode-normalisation";

/**
 * Customer saved addresses (#764) — the ONLY DB access for `CustomerAddress`.
 *
 * ## What this is NOT
 *
 * It is not `Address`. `Address` is a per-order **snapshot**, written once inside `placeOrder`'s
 * transaction and never updated, because `specs/architecture.md` requires that editing a saved
 * address must not rewrite where a past order was delivered. This table is the editable thing a
 * checkout form is populated *from*; the snapshot stays what an order was delivered *to*. Nothing
 * in this module reads or writes `Address`, and correcting a typo here changes no existing order.
 *
 * ## Scoping
 *
 * Unlike `postcodes.ts` and `places.ts`, this **is** domain data, so ADR-004's mandatory `vendorId`
 * filter applies in full — and `userId` alongside it. Every export takes both explicitly, and every
 * query filters on both, so a saved address can never surface to another vendor or another
 * customer even given a valid id. The guard lives in the query, not in which host served the page.
 *
 * `userId` is required by the schema: a guest has no durable identity to own a saved record, and
 * minting one for somebody who declined to create an account would be the wrong trade. Guests keep
 * using the delivery-postcode cookie.
 *
 * Every export takes `prisma` explicitly and reads no request context; the request-scoped facade is
 * `lib/customer-addresses-service.ts`.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;

export interface CustomerAddressRow {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  county: string | null;
  postcode: string;
  notes: string | null;
  isDefault: boolean;
}

export interface CustomerAddressInput {
  label?: string | null;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  county?: string | null;
  postcode: string;
  notes?: string | null;
}

const ROW_FIELDS = {
  id: true,
  label: true,
  recipientName: true,
  phone: true,
  line1: true,
  line2: true,
  city: true,
  county: true,
  postcode: true,
  notes: true,
  isDefault: true,
} as const;

/**
 * A customer's saved addresses for one vendor, most recently used first.
 *
 * Ordering puts `isDefault` ahead of everything, then recency, because the address a returning
 * shopper wants is overwhelmingly the one they used last.
 */
export async function listCustomerAddresses(
  prisma: Db,
  vendorId: string,
  userId: string,
): Promise<CustomerAddressRow[]> {
  return prisma.customerAddress.findMany({
    where: { vendorId, userId },
    orderBy: [{ isDefault: "desc" }, { lastUsedAt: "desc" }, { createdAt: "desc" }],
    select: ROW_FIELDS,
  });
}

/** One saved address, or null when it does not belong to this vendor and user. */
export async function findCustomerAddress(
  prisma: Db,
  vendorId: string,
  userId: string,
  id: string,
): Promise<CustomerAddressRow | null> {
  return prisma.customerAddress.findFirst({
    where: { id, vendorId, userId },
    select: ROW_FIELDS,
  });
}

/**
 * Save an address the customer has confirmed, or return the existing one if they already have it.
 *
 * Deduplicated on the normalised postcode plus the first address line, so confirming the same
 * address at every checkout does not accumulate near-identical rows. There is no unique constraint
 * behind this: two genuinely different flats can share a line 1 and postcode, and a database-level
 * uniqueness rule would refuse the second one outright. Matching in the query and falling through
 * to a create is the softer behaviour a person actually wants.
 */
export async function saveCustomerAddress(
  prisma: Db,
  vendorId: string,
  userId: string,
  input: CustomerAddressInput,
): Promise<CustomerAddressRow> {
  const postcode = formatPostcode(input.postcode);
  const normalised = normalisePostcode(input.postcode);

  const existing = await prisma.customerAddress.findFirst({
    where: {
      vendorId,
      userId,
      line1: input.line1.trim(),
    },
    select: { ...ROW_FIELDS, postcode: true },
  });

  if (existing && normalisePostcode(existing.postcode) === normalised) {
    return prisma.customerAddress.update({
      where: { id: existing.id },
      data: { lastUsedAt: new Date() },
      select: ROW_FIELDS,
    });
  }

  const isFirst = (await prisma.customerAddress.count({ where: { vendorId, userId } })) === 0;

  return prisma.customerAddress.create({
    data: {
      vendorId,
      userId,
      label: input.label?.trim() || null,
      recipientName: input.recipientName.trim(),
      phone: input.phone.trim(),
      line1: input.line1.trim(),
      line2: input.line2?.trim() || null,
      city: input.city.trim(),
      county: input.county?.trim() || null,
      postcode,
      notes: input.notes?.trim() || null,
      isDefault: isFirst,
      lastUsedAt: new Date(),
    },
    select: ROW_FIELDS,
  });
}

/**
 * Record that a saved address was used again, so it sorts first next time.
 *
 * Scoped by vendor and user in the `where`, so a crafted id belonging to somebody else updates
 * nothing rather than touching their row. That scoping is why this is an `updateMany` on a
 * compound condition rather than an `update` by primary key.
 *
 * TAKES THE WEBSOCKET CLIENT, and must. `updateMany` and `createMany` crash unconditionally
 * through the HTTP adapter `getPrisma()` returns — Prisma's client-side query compiler wraps them
 * in a transaction `PrismaNeonHttp` can never execute (#382, CLAUDE.md). This path is reachable
 * from a real request (a returning shopper picking a saved address), so it would 500 in production
 * on the ordinary client while passing every local unit test.
 */
export async function touchCustomerAddress(
  prismaWs: DbWs,
  vendorId: string,
  userId: string,
  id: string,
): Promise<void> {
  await prismaWs.customerAddress.updateMany({
    where: { id, vendorId, userId },
    data: { lastUsedAt: new Date() },
  });
}

/**
 * Delete a saved address.
 *
 * Deleting one has no effect on any order: an order's delivery address is its own `Address`
 * snapshot row, written at checkout and never linked to this table.
 */
export async function deleteCustomerAddress(
  prisma: Db,
  vendorId: string,
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await prisma.customerAddress.deleteMany({ where: { id, vendorId, userId } });
  return deleted.count > 0;
}
