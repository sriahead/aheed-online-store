import type { getPrisma } from "@/lib/db";

/**
 * UK GDPR data-subject rights (P7b, #216) — the ONLY DB access for export and
 * erasure. Pages, route handlers and feature actions reach this through
 * lib/data-rights-service.ts's request-scoped wrapper (ADR-004 slice-2
 * no-direct-Prisma guard) — nothing in this file resolves a live client or a
 * request itself; see that file for why the split exists.
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
 * EVERY EXPORTED FUNCTION HERE takes `prisma` and the vendor as EXPLICIT
 * arguments and reads no request context — no `getCurrentVendorId()`, no
 * `headers()`, no `getAuth()` — matching `placeOrder(prisma, vendorId, input)`
 * and the loyalty repository. That is why the request-scoped facade lives in
 * lib/data-rights-service.ts instead of here: it necessarily resolves a live
 * client and calls `getCurrentVendorId()`, and if it lived in this file that
 * import would be a second entry point request context could reach the
 * exports through — the property this module exists to hold would only be
 * true of *some* of its exports, not all of them. lib/auth-rbac.ts is the
 * same split for the same reason (a request-context wrapper beside, not
 * inside, `lib/repositories/`).
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

/**
 * A guest's Art. 15 export: exactly one order, proven by the order-number/email
 * pair (#253, P8.1b).
 *
 * Deliberately a NARROWER shape than `PersonalDataExport`, not a reuse of it.
 * That type is built around an `identity` — a `User` row, its linked accounts
 * and its sessions — and a guest has none of those; there is no account, only an
 * order with an email attached to it. Reusing the wider type would have meant
 * emitting a dozen empty arrays and a fabricated identity block, which reads as
 * "we hold nothing of this kind about you" when the truth is "that question does
 * not apply to a guest". The overlapping parts — the `order` and `address`
 * blocks — are field-for-field the same as their counterparts there, so the two
 * documents remain the same format for the data they both describe.
 */
export interface GuestOrderExport {
  exportedAt: string;
  vendor: { id: string; name: string };
  /**
   * SCOPE, stated in the document itself. The household-mailbox limit
   * (specs/2026-08-19-p7-closeout/plan.md Part C decision 2) means this covers
   * the ONE order proven by the credential pair, never every order sharing the
   * address — so the export says so rather than leaving a reader to assume it is
   * everything held about them.
   */
  scope: string;
  order: {
    orderNumber: string;
    status: string;
    currency: string;
    subtotalPence: number;
    discountPence: number;
    deliveryFeePence: number;
    totalPence: number;
    createdAt: Date;
    guestEmail: string | null;
    items: { productName: string; quantity: number; unitPricePence: number }[];
    payment: { provider: string; status: string; amountPence: number; createdAt: Date } | null;
    statusHistory: { status: string; note: string | null; createdAt: Date }[];
  };
  address: {
    recipientName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    postcode: string;
    notes: string | null;
    createdAt: Date;
  } | null;
}

const GUEST_EXPORT_SCOPE =
  "This document covers only the single order identified by the order number and email address " +
  "supplied. It is not a record of every order placed from that email address: an order number is " +
  "proof of one order, not proof of identity, so a broader export would disclose other people's " +
  "orders to anyone holding one order number for a shared household mailbox.";

/**
 * Everything this vendor holds about one guest order (Art. 15), keyed by the
 * same order-number/email credential pair `eraseGuestOrderData` uses below.
 *
 * The pair is verified AT THE QUERY LEVEL — `orderNumber`, `vendorId`,
 * `userId: null` and a case-insensitive `guestEmail` all sit in the WHERE, so a
 * wrong email does not match rather than being compared afterwards, and an
 * account-holder's order is unreachable through this door however its number is
 * guessed. Returns `null` on no match, exactly like the erasure, so a caller
 * cannot distinguish "no such order" from "wrong email".
 */
export async function exportGuestOrderData(
  prisma: AnyDb,
  vendorId: string,
  orderNumber: string,
  email: string,
): Promise<GuestOrderExport | null> {
  const [vendor, order] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { id: true, name: true } }),
    prisma.order.findFirst({
      where: {
        orderNumber,
        vendorId,
        userId: null,
        guestEmail: { equals: email, mode: "insensitive" },
      },
      select: {
        orderNumber: true,
        status: true,
        currency: true,
        subtotalPence: true,
        discountPence: true,
        deliveryFeePence: true,
        totalPence: true,
        createdAt: true,
        guestEmail: true,
        items: { select: { productName: true, quantity: true, unitPricePence: true } },
        payment: {
          select: { provider: true, status: true, amountPence: true, createdAt: true },
        },
        statusEvents: {
          select: { status: true, note: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
        address: {
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
        },
      },
    }),
  ]);

  if (!order) return null;

  const { statusEvents, address, ...rest } = order;
  return {
    exportedAt: new Date().toISOString(),
    vendor,
    scope: GUEST_EXPORT_SCOPE,
    order: { ...rest, statusHistory: statusEvents },
    address,
  };
}

export interface GuestEraseResult {
  /** Echoed back so the caller can confirm what was erased without re-reading. */
  orderNumber: string;
  addressesRedacted: number;
}

/**
 * Erase the personal data attached to ONE guest order, atomically.
 *
 * P7 closeout (#251 / #222). P7b gave account holders self-service erasure;
 * a guest who checked out without an account had no route to Art. 17 at all,
 * and UK GDPR rights are not conditional on holding an account.
 *
 * THE CREDENTIAL PAIR IS CHECKED HERE, INSIDE THE TRANSACTION — not by the
 * caller. `vendorId + orderNumber + email` is matched at the query level, so
 * there is no window between "the caller proved ownership" and "we erased", and
 * no way to invoke this with an unverified pair. A non-matching pair returns
 * null and touches nothing; the caller cannot distinguish a wrong order number
 * from a wrong email, which is the same posture `findOrderForGuestLookup` takes
 * and for the same reason.
 *
 * ONE ORDER PER CALL, deliberately. The pair proves control of *that order*, so
 * that is exactly what it erases. Widening to "every order for this email" would
 * mean acting on an email string alone, and P7a already judged email
 * insufficient proof of ownership because households share mailboxes — which is
 * why the lookup requires the pair plus a rate limiter in the first place. A
 * guest with three orders repeats the flow three times; that repetition is the
 * price of not weakening the proof.
 *
 * The shape mirrors `eraseVendorData`: the money survives, the person does not.
 * `guestEmail` is cleared and the delivery address is redacted in place
 * (`Order.addressId` is not nullable, so the row cannot simply go), while
 * `totalPence`, `status` and `orderNumber` are untouched — the order still has
 * to stand as a financial record.
 *
 * Must be called with the WEBSOCKET client (`getPrismaWs()`): `PrismaNeonHttp`
 * cannot run interactive transactions, and a half-applied erasure leaves a
 * shopper partly deleted with no way to tell where it stopped.
 */
export async function eraseGuestOrderData(
  prisma: Db,
  vendorId: string,
  orderNumber: string,
  email: string,
): Promise<GuestEraseResult | null> {
  return prisma.$transaction(async (tx) => {
    // Guest orders only: `userId` must be null. An account-holder's order is
    // reachable from /account/data with a real session, and erasing it from
    // behind an order-number pair would be a weaker proof for the same data.
    const order = await tx.order.findFirst({
      where: {
        orderNumber,
        vendorId,
        userId: null,
        guestEmail: { equals: email, mode: "insensitive" },
      },
      select: { id: true, orderNumber: true, addressId: true },
    });

    if (!order) return null;

    await tx.order.updateMany({
      where: { id: order.id, vendorId },
      data: { guestEmail: null },
    });

    const redacted = await tx.address.updateMany({
      where: { id: order.addressId, vendorId },
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

    return { orderNumber: order.orderNumber, addressesRedacted: redacted.count };
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
