import type { getPrisma } from "@/lib/db";

/**
 * UK GDPR data-subject rights (P7b, #216) — the ONLY DB access for export and
 * erasure. Pages, route handlers and feature actions go through here (ADR-004
 * slice-2 no-direct-Prisma guard).
 *
 * THE `@/lib/db` IMPORT IS TYPE-ONLY, DELIBERATELY. lib/db.ts imports
 * PrismaClient from `@prisma/client/wasm`, which is the workerd-safe loader and
 * not something a plain Node process should pull in — scripts/demo-accounts.ts
 * records the same rule from the other direction ("uses the bare @prisma/client
 * like seed.ts, never lib/db.ts's @prisma/client/wasm"). Every function here
 * already takes its client as an argument, so the runtime import would buy
 * nothing and would stop `scripts/verify-data-rights.ts` from loading this
 * module at all — and that script is how the erasure's atomicity and
 * cross-vendor isolation get proven.
 *
 * Every function takes `prisma` and the vendor as EXPLICIT arguments and reads
 * no request context, matching `placeOrder(prisma, vendorId, input)` and the
 * loyalty repository. Same reason: these properties cannot be tested at all if
 * the only entry point needs a live Workers request.
 */

type Db = ReturnType<typeof getPrisma>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
type AnyDb = Db | Tx;

/**
 * What a redacted address field reads as afterwards.
 *
 * Non-nullable columns get this marker; nullable ones (`line2`, `notes`) are set
 * to NULL instead, because writing a placeholder into a column that can simply
 * hold nothing stores a string where the honest answer is absence.
 */
export const REDACTED = "[erased]";

// ---------------------------------------------------------------------------
// Art. 15 — access / export
// ---------------------------------------------------------------------------

export interface PersonalDataExport {
  exportedAt: string;
  vendor: { id: string; name: string };
  identity: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    role: string;
    createdAt: Date;
  };
  /** Provider names only — never the stored credential or any OAuth token. */
  linkedAccounts: { providerId: string; createdAt: Date }[];
  /** Session metadata is personal data (IP, user agent); the session token is not disclosed. */
  sessions: {
    createdAt: Date;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }[];
  addresses: {
    recipientName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    postcode: string;
    notes: string | null;
    createdAt: Date;
  }[];
  orders: {
    orderNumber: string;
    status: string;
    currency: string;
    subtotalPence: number;
    discountPence: number;
    deliveryFeePence: number;
    totalPence: number;
    createdAt: Date;
    items: { productName: string; quantity: number; unitPricePence: number }[];
    payment: { provider: string; status: string; amountPence: number; createdAt: Date } | null;
    statusHistory: { status: string; note: string | null; createdAt: Date }[];
  }[];
  reviews: { rating: number; comment: string | null; createdAt: Date; product: string }[];
  carts: { createdAt: Date; items: { product: string; quantity: number }[] }[];
  loyalty: {
    account: { balancePoints: number; lifetimePoints: number; lastActivityAt: Date } | null;
    ledger: { kind: string; points: number; createdAt: Date; orderNumber: string }[];
  };
  discountRedemptions: { code: string; amountPence: number; createdAt: Date }[];
}

/**
 * Everything this vendor holds about this user, as a plain JSON-serialisable
 * object (Art. 15, and Art. 20 portability in practice — it is structured and
 * machine-readable, so no second format is produced).
 *
 * Vendor-scoped: shopping at two vendors produces two separate exports, which
 * falls straight out of ADR-004 row-level tenancy. `identity`, `linkedAccounts`
 * and `sessions` come from the global identity tables, which carry no vendorId —
 * they are the requester's own account details, so including them discloses
 * nothing about any other vendor.
 */
export async function exportPersonalData(
  prisma: AnyDb,
  vendorId: string,
  userId: string,
): Promise<PersonalDataExport> {
  const [
    vendor,
    user,
    accounts,
    sessions,
    addresses,
    orders,
    reviews,
    carts,
    loyaltyAccount,
    ledger,
    redemptions,
  ] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { id: true, name: true } }),
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        role: true,
        createdAt: true,
      },
    }),
    // providerId only. Account also holds password hashes and OAuth tokens;
    // none of it is disclosed, and an export is not a credential dump.
    prisma.account.findMany({
      where: { userId },
      select: { providerId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.session.findMany({
      where: { userId },
      select: { createdAt: true, expiresAt: true, ipAddress: true, userAgent: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.address.findMany({
      where: { vendorId, userId },
      select: {
        recipientName: true,
        phone: true,
        line1: true,
        line2: true,
        city: true,
        postcode: true,
        notes: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: { vendorId, userId },
      select: {
        orderNumber: true,
        status: true,
        currency: true,
        subtotalPence: true,
        discountPence: true,
        deliveryFeePence: true,
        totalPence: true,
        createdAt: true,
        items: { select: { productName: true, quantity: true, unitPricePence: true } },
        payment: {
          select: { provider: true, status: true, amountPence: true, createdAt: true },
        },
        statusEvents: {
          select: { status: true, note: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.review.findMany({
      where: { vendorId, userId },
      select: {
        rating: true,
        comment: true,
        createdAt: true,
        product: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cart.findMany({
      where: { vendorId, userId },
      select: {
        createdAt: true,
        items: { select: { quantity: true, product: { select: { name: true } } } },
      },
    }),
    prisma.loyaltyAccount.findUnique({
      where: { vendorId_userId: { vendorId, userId } },
      select: { balancePoints: true, lifetimePoints: true, lastActivityAt: true },
    }),
    prisma.loyaltyLedgerEntry.findMany({
      where: { vendorId, userId },
      select: {
        kind: true,
        points: true,
        createdAt: true,
        order: { select: { orderNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.discountRedemption.findMany({
      where: { vendorId, userId },
      select: { amountPence: true, createdAt: true, code: { select: { code: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    vendor,
    identity: user,
    linkedAccounts: accounts,
    sessions,
    addresses,
    orders: orders.map((order) => ({
      orderNumber: order.orderNumber,
      status: order.status,
      currency: order.currency,
      subtotalPence: order.subtotalPence,
      discountPence: order.discountPence,
      deliveryFeePence: order.deliveryFeePence,
      totalPence: order.totalPence,
      createdAt: order.createdAt,
      items: order.items,
      payment: order.payment,
      statusHistory: order.statusEvents,
    })),
    reviews: reviews.map((review) => ({
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      product: review.product.name,
    })),
    carts: carts.map((cart) => ({
      createdAt: cart.createdAt,
      items: cart.items.map((item) => ({ product: item.product.name, quantity: item.quantity })),
    })),
    loyalty: {
      account: loyaltyAccount,
      ledger: ledger.map((entry) => ({
        kind: entry.kind,
        points: entry.points,
        createdAt: entry.createdAt,
        orderNumber: entry.order.orderNumber,
      })),
    },
    discountRedemptions: redemptions.map((redemption) => ({
      code: redemption.code.code,
      amountPence: redemption.amountPence,
      createdAt: redemption.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Art. 17 — erasure
// ---------------------------------------------------------------------------

/**
 * How many rows at OTHER vendors still tie this user to a live relationship.
 *
 * THE ONE DELIBERATE CROSS-VENDOR QUERY IN THIS CODEBASE'S DOMAIN LAYER, and it
 * is contracted as narrowly as the question allows: it returns an integer and
 * nothing else — never rows, never field values, never a vendor id or name.
 * That distinction is the whole argument for it. An un-scoped *read* is what
 * `findOrderForWebhook` is, and wiring that to a public surface disclosed order
 * contents (PR #204); a function that can only answer "how many" tells vendor A
 * nothing about vendor B beyond the fact that this user shops there — which the
 * user already knows about themselves, and which is unavoidable if "is this
 * your last vendor?" is to be answerable at all.
 *
 * Do not widen this to return rows. If a caller needs more than a count, that
 * is a new decision, not a small change.
 */
export async function countOtherVendorData(
  prisma: AnyDb,
  userId: string,
  excludingVendorId: string,
): Promise<number> {
  const notThisVendor = { vendorId: { not: excludingVendorId }, userId };
  const counts = await Promise.all([
    prisma.order.count({ where: notThisVendor }),
    prisma.address.count({ where: notThisVendor }),
    prisma.review.count({ where: notThisVendor }),
    prisma.cart.count({ where: notThisVendor }),
    prisma.loyaltyAccount.count({ where: notThisVendor }),
    prisma.loyaltyLedgerEntry.count({ where: notThisVendor }),
    prisma.discountRedemption.count({ where: notThisVendor }),
  ]);
  return counts.reduce((total, count) => total + count, 0);
}

export interface EraseResult {
  /** True when this was the user's last vendor, so the shared identity was deleted too. */
  identityDeleted: boolean;
  ordersAnonymised: number;
  addressesRedacted: number;
  reviewsDeleted: number;
}

/**
 * Erase this user's personal data at ONE vendor, atomically.
 *
 * The shape is dictated by what the schema already retains and by what the law
 * requires to survive — see specs/2026-08-18-p7b-data-rights/plan.md for the
 * table-by-table reasoning. In short: the money survives, the person does not.
 *
 * Orders are tombstoned rather than deleted (the financial record must be
 * retained), addresses are redacted in place because `Order.addressId` is not
 * nullable, and the loyalty ledger keeps its rows with a null owner so a
 * surviving order's `discountPence` still has an explanation.
 *
 * Must be called with the WEBSOCKET client (`getPrismaWs()`): PrismaNeonHttp
 * cannot run interactive transactions, and this has to be all-or-nothing —
 * a partial erasure leaves a user half-deleted with no way to tell where it
 * stopped.
 */
export async function eraseVendorData(
  prisma: Db,
  vendorId: string,
  userId: string,
): Promise<EraseResult> {
  return prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      where: { vendorId, userId },
      select: { id: true, addressId: true },
    });
    const orderIds = orders.map((order) => order.id);
    const addressIds = orders.map((order) => order.addressId);

    // Tombstone the orders: the buyer link goes, the financial record stays.
    const anonymised = await tx.order.updateMany({
      where: { vendorId, userId },
      data: { userId: null, guestEmail: null },
    });

    // Redact every address this user owns at this vendor, plus any address one
    // of their orders points at (an order's address is a snapshot and may not
    // carry the userId). Redacting in place is a deliberate exception to that
    // snapshot's "written once and never updated" rule — the alternative is
    // deleting a row a non-nullable FK still points at.
    const redacted = await tx.address.updateMany({
      where: { vendorId, OR: [{ userId }, { id: { in: addressIds } }] },
      data: {
        recipientName: REDACTED,
        phone: REDACTED,
        line1: REDACTED,
        line2: null,
        city: REDACTED,
        postcode: REDACTED,
        notes: null,
        userId: null,
      },
    });

    // The user's own content and live state: no retention interest in any of it.
    const reviews = await tx.review.deleteMany({ where: { vendorId, userId } });
    await tx.cart.deleteMany({ where: { vendorId, userId } });
    await tx.loyaltyAccount.deleteMany({ where: { vendorId, userId } });

    // Audit trails keep their rows and lose their owner.
    await tx.loyaltyLedgerEntry.updateMany({
      where: { vendorId, userId },
      data: { userId: null },
    });
    await tx.discountRedemption.updateMany({
      where: { vendorId, userId },
      data: { userId: null },
    });
    if (orderIds.length > 0) {
      await tx.orderStatusEvent.updateMany({
        where: { vendorId, orderId: { in: orderIds }, createdByUserId: userId },
        data: { createdByUserId: null },
      });
    }

    // The shared identity goes only when no other vendor still holds data —
    // deleting it otherwise would sign the user out of a vendor that never
    // received an erasure request. Counted inside the transaction so a
    // concurrent order at another vendor cannot slip in behind the check.
    const elsewhere = await countOtherVendorData(tx, userId, vendorId);
    const identityDeleted = elsewhere === 0;
    if (identityDeleted) {
      // Session and Account cascade from this; LoyaltyLedgerEntry no longer
      // does (P7b migration), which is the entire point of that migration.
      await tx.user.delete({ where: { id: userId } });
    }

    return {
      identityDeleted,
      ordersAnonymised: anonymised.count,
      addressesRedacted: redacted.count,
      reviewsDeleted: reviews.count,
    };
  });
}

// ---------------------------------------------------------------------------
// Art. 16 — rectification
// ---------------------------------------------------------------------------

/**
 * Update the display name on the shared identity.
 *
 * Not vendor-scoped, because `User` isn't — correcting your own name corrects it
 * everywhere you shop, which is the right behaviour for a single identity and
 * discloses nothing. Email is deliberately not changeable here (#221): it is the
 * account handle and needs verification against the new address, which needs
 * working email delivery (#104).
 */
export async function updateDisplayName(
  prisma: AnyDb,
  userId: string,
  name: string,
): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { name } });
}

/** Does this user hold any staff/admin grant? Erasure refuses if so. */
export async function hasVendorMembership(prisma: AnyDb, userId: string): Promise<boolean> {
  return (await prisma.vendorMembership.count({ where: { userId } })) > 0;
}

/** The providers backing this account — decides which erasure confirmation applies. */
export async function getAccountProviders(prisma: AnyDb, userId: string): Promise<string[]> {
  const rows = await prisma.account.findMany({
    where: { userId },
    select: { providerId: true },
  });
  return rows.map((row) => row.providerId);
}

// ---------------------------------------------------------------------------
// Request-scoped facade
// ---------------------------------------------------------------------------

export interface DataRightsRepository {
  exportForCurrentVendor(userId: string): Promise<PersonalDataExport>;
  eraseForCurrentVendor(userId: string): Promise<EraseResult>;
  updateDisplayName(userId: string, name: string): Promise<void>;
  hasVendorMembership(userId: string): Promise<boolean>;
  getAccountProviders(userId: string): Promise<string[]>;
}

/**
 * The request-scoped wrapper the app layer uses, resolving the client and the
 * vendor itself — `features/` and `app/` cannot import `@/lib/db` (ADR-004
 * slice-2 lint guard), so something in `lib/` has to.
 *
 * THE `@/lib/db` IMPORT IS DYNAMIC, AND THAT IS LOAD-BEARING, not a style
 * choice. A top-level import would make this whole module unloadable outside
 * workerd: `@prisma/client/wasm` does not resolve in real Node at all
 * (`Cannot find module .../wasm.mjs` — verified, not assumed), so
 * scripts/verify-data-rights.ts could not import the pure functions above, and
 * those functions are the only way the erasure's atomicity and cross-vendor
 * isolation get proven. Deferring the import to the one place that genuinely
 * needs a live client keeps both properties: the module loads in Node, and the
 * facade works on Workers.
 *
 * Async for the same reason, unlike the other repositories' sync factories.
 *
 * Constructed fresh per call, never cached across requests — a cached client
 * throws "Cannot perform I/O on behalf of a different request" on Workers
 * (CLAUDE.md), and caching a wrapper pins the first request's client inside it
 * just the same.
 */
export async function getDataRightsRepository(): Promise<DataRightsRepository> {
  const [{ getPrisma, getPrismaWs }, { getCurrentVendorId }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/tenant"),
  ]);
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async exportForCurrentVendor(userId) {
      return exportPersonalData(prisma, await vendorId(), userId);
    },
    async eraseForCurrentVendor(userId) {
      // The WebSocket client, strictly for this transaction: PrismaNeonHttp
      // cannot run interactive transactions, and a half-applied erasure is the
      // one outcome there is no way to recover from.
      return eraseVendorData(getPrismaWs(), await vendorId(), userId);
    },
    async updateDisplayName(userId, name) {
      return updateDisplayName(prisma, userId, name);
    },
    async hasVendorMembership(userId) {
      return hasVendorMembership(prisma, userId);
    },
    async getAccountProviders(userId) {
      return getAccountProviders(prisma, userId);
    },
  };
}
