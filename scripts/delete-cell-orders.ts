import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { readVar, stripeMode } from "./aheed-data-inventory";

/**
 * #1512 — delete EVERY order in one dedicated-cell database, before the store goes live.
 *
 *   npx tsx scripts/delete-cell-orders.ts <secrets file> <URL key>                       (dry run)
 *   npx tsx scripts/delete-cell-orders.ts <secrets file> <URL key> --apply --confirm-host <db host>
 *   e.g. secrets/afc-production.vars AFC_DIRECT_URL
 *
 * Owner decision (2026-11-11): no orders may exist in Aheed production before go-live. A DRY RUN is
 * the default and writes nothing. `--rehearse` runs the whole delete transaction and then rolls it
 * back, proving the write path without changing data. The dry run lists each order by number, date, status, total and Stripe mode
 * (no names, emails or addresses) and counts every row the delete would touch. `--apply` additionally
 * needs `--confirm-host` naming the database host, so a wrong secrets file cannot be applied by
 * accident. It refuses outright if any payment is Stripe LIVE: a real customer's money is never
 * deleted by a cleanup script.
 *
 * Deleting an Order cascades in the schema to OrderItem, Payment, OrderStatusEvent,
 * LoyaltyLedgerEntry, DiscountRedemption, PaymentReconciliation and PaymentBindingRefusal. Three
 * pieces of derived state are put right in the SAME transaction:
 *   - a LoyaltyAccount left with no ledger entries is deleted (its cached balance came only from
 *     the deleted orders; the loyalty repository creates an account again on the next earn);
 *   - each DiscountCode with a finite `remainingRedemptions` gets back the redemptions those orders
 *     used;
 *   - a guest Address (no userId) used only by the deleted orders is deleted.
 *
 * Multi-statement and all-or-nothing, so it uses the WebSocket adapter (an interactive transaction),
 * per CLAUDE.md's hybrid-client rule. Back up first: Neon console → the project → Branches → Create
 * branch from the current state. Production commands are run by the owner.
 */

export function parseArgs(argv: readonly string[]) {
  const [file, key] = argv;
  const apply = argv.includes("--apply");
  const rehearse = argv.includes("--rehearse");
  const i = argv.indexOf("--confirm-host");
  const confirmHost = i >= 0 ? argv[i + 1] : undefined;
  return { file, key, apply, rehearse, confirmHost };
}

async function main() {
  const { file, key, apply, rehearse, confirmHost } = parseArgs(process.argv.slice(2));
  if (!file || !key) {
    throw new Error(
      "usage: delete-cell-orders.ts <secrets file> <URL key> [--rehearse | --apply --confirm-host <db host>]",
    );
  }
  if (apply && rehearse) throw new Error("choose --apply or --rehearse, not both");
  const url = readVar(file, key);
  if (!url) throw new Error(`${key} not found in ${file}`);
  const host = new URL(url).hostname;
  console.log(`database host: ${host}`);
  console.log(
    apply
      ? "MODE: APPLY (deletes)"
      : rehearse
        ? "MODE: rehearse (runs the delete transaction, then rolls it back)"
        : "MODE: dry run (writes nothing)",
  );
  if (apply && confirmHost !== host) {
    throw new Error(`--apply needs --confirm-host ${host} (got ${confirmHost ?? "nothing"})`);
  }

  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  try {
    const orders = await p.order.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        status: true,
        totalPence: true,
        addressId: true,
        vendor: { select: { slug: true } },
        payment: { select: { status: true, providerReference: true } },
      },
    });
    console.log(`\norders: ${orders.length}`);
    for (const o of orders) {
      const mode = stripeMode(o.payment?.providerReference ?? null);
      console.log(
        `  ${o.orderNumber}  ${o.createdAt.toISOString().slice(0, 10)}  ${o.vendor.slug}  ${o.status}  £${(
          o.totalPence / 100
        ).toFixed(2)}  payment ${o.payment?.status ?? "none"} (${mode})`,
      );
    }
    if (orders.length === 0) {
      console.log("nothing to delete");
      return;
    }
    const live = orders.filter((o) => stripeMode(o.payment?.providerReference ?? null) === "live");
    if (live.length > 0) {
      throw new Error(
        `REFUSED: ${live.length} order(s) carry a Stripe LIVE payment (${live
          .map((o) => o.orderNumber)
          .join(", ")}). Real payments are never deleted by this script.`,
      );
    }

    const ids = orders.map((o) => o.id);
    const byOrder = { orderId: { in: ids } };
    const [items, events, ledger, redemptions, reconciliations, refusals] = await Promise.all([
      p.orderItem.count({ where: byOrder }),
      p.orderStatusEvent.count({ where: byOrder }),
      p.loyaltyLedgerEntry.findMany({ where: byOrder, select: { userId: true, vendorId: true } }),
      p.discountRedemption.findMany({ where: byOrder, select: { codeId: true, reversedAt: true } }),
      p.paymentReconciliation.count({ where: byOrder }),
      p.paymentBindingRefusal.count({ where: byOrder }),
    ]);

    // Loyalty accounts whose EVERY ledger entry belongs to a deleted order.
    const touched = [...new Set(ledger.map((l) => `${l.vendorId}:${l.userId}`))];
    const emptyAfter: { vendorId: string; userId: string }[] = [];
    for (const k of touched) {
      const [vendorId, userId] = k.split(":");
      const remaining = await p.loyaltyLedgerEntry.count({
        where: { vendorId, userId, orderId: { notIn: ids } },
      });
      if (remaining === 0) emptyAfter.push({ vendorId, userId });
    }

    // Redemptions to give back, per code, only where the code tracks a finite remaining count.
    const perCode = new Map<string, number>();
    // A reversed redemption already gave its use back; counting it again would over-credit the code.
    for (const r of redemptions.filter((x) => x.reversedAt === null))
      perCode.set(r.codeId, (perCode.get(r.codeId) ?? 0) + 1);
    const finiteCodes = await p.discountCode.findMany({
      where: { id: { in: [...perCode.keys()] }, remainingRedemptions: { not: null } },
      select: { id: true },
    });

    // Guest addresses used by no order outside the deleted set.
    const addressIds = [...new Set(orders.map((o) => o.addressId))];
    const guestAddresses = await p.address.findMany({
      where: { id: { in: addressIds }, userId: null, orders: { every: { id: { in: ids } } } },
      select: { id: true },
    });

    console.log("\nrows the delete touches:");
    console.log(
      `  orders ${orders.length}, items ${items}, payments ${orders.filter((o) => o.payment).length}`,
    );
    console.log(
      `  status events ${events}, reconciliations ${reconciliations}, binding refusals ${refusals}`,
    );
    console.log(
      `  loyalty ledger entries ${ledger.length}; loyalty accounts reset ${emptyAfter.length}`,
    );
    console.log(
      `  discount redemptions ${redemptions.length}; codes given back redemptions ${finiteCodes.length}`,
    );
    console.log(`  guest addresses deleted ${guestAddresses.length}`);

    if (!apply && !rehearse) {
      console.log(`\ndry run only. To delete: add --apply --confirm-host ${host}`);
      return;
    }

    const ROLLBACK = "rehearsal: rolled back on purpose";
    const result = await p
      .$transaction(async (tx) => {
        for (const c of finiteCodes) {
          await tx.discountCode.update({
            where: { id: c.id },
            data: { remainingRedemptions: { increment: perCode.get(c.id)! } },
          });
        }
        const deleted = await tx.order.deleteMany({ where: { id: { in: ids } } });
        for (const a of emptyAfter) {
          await tx.loyaltyAccount.deleteMany({ where: { vendorId: a.vendorId, userId: a.userId } });
        }
        await tx.address.deleteMany({ where: { id: { in: guestAddresses.map((a) => a.id) } } });
        if (deleted.count !== orders.length) {
          throw new Error(
            `expected to delete ${orders.length} orders, deleted ${deleted.count}; rolled back`,
          );
        }
        const left = await tx.order.count();
        // --rehearse: every statement above really ran; throwing here undoes all of it.
        if (rehearse)
          throw new Error(`${ROLLBACK} (${deleted.count} deleted, ${left} left inside)`);
        return `${left} left`;
      })
      .catch((e: unknown) => {
        if (rehearse && e instanceof Error && e.message.startsWith(ROLLBACK)) return e.message;
        throw e;
      });
    if (rehearse) {
      console.log(`\nREHEARSAL OK: ${result}. Orders now: ${await p.order.count()} (unchanged)`);
    } else {
      console.log(`\nAPPLIED (${result}). Orders remaining: ${await p.order.count()}`);
    }
  } finally {
    await p.$disconnect();
  }
}

if (process.argv[1]?.endsWith("delete-cell-orders.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
