import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { readVar } from "./aheed-data-inventory";

/**
 * #1519 (part of go-live, S1e) — switch on a cell's OFFER products and everything a shopper needs
 * to reach and buy them; nothing else.
 *
 *   npx tsx scripts/catalogue-activate-offers.ts <secrets file> <URL key> --vendor-slug <slug>
 *   … --apply --confirm-host <db host> [--production]
 *
 * An offer product is one with an active multi-buy tier or an `Offer Type` value (#1517). For each:
 *   - the product is switched on — unless it is restricted (the database refuses that anyway,
 *     `Product_restricted_inactive_check`) or priced at £0, which are reported and left off;
 *   - an UNKNOWN stock mode ("Unknown — not for sale") becomes UNTRACKED, so it can be bought without
 *     a stock count; a TRACKED or INFINITE mode is left as the owner set it;
 *   - its category and that category's parent are switched on.
 * Then every bundle whose items are ALL activated offer products is switched on, and every
 * promotion linked to such a bundle, or to one of those categories, is switched on.
 *
 * Dry run by default; `--apply` needs `--confirm-host`; a production secrets file also needs
 * `--production`. Re-running changes nothing.
 */

export interface OfferCandidate {
  id: string;
  name: string;
  basePrice: number;
  restriction: string | null;
}

/** Why an offer product cannot be switched on, or null when it can. */
export function blockReason(p: OfferCandidate): string | null {
  if (p.restriction !== null) return `restricted (${p.restriction})`;
  if (p.basePrice <= 0) return "price is £0";
  return null;
}

/** A bundle is activated only when every one of its products is. */
export function bundleQualifies(
  itemProductIds: readonly string[],
  activated: ReadonlySet<string>,
): boolean {
  return itemProductIds.length > 0 && itemProductIds.every((id) => activated.has(id));
}

function flags(argv: readonly string[]) {
  const at = (flag: string) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);
  return {
    file: argv[0],
    key: argv[1],
    vendorSlug: at("--vendor-slug"),
    apply: argv.includes("--apply"),
    production: argv.includes("--production"),
    confirmHost: at("--confirm-host"),
  };
}

async function main() {
  const f = flags(process.argv.slice(2));
  if (!f.file || !f.key || !f.vendorSlug)
    throw new Error("usage: see the header of scripts/catalogue-activate-offers.ts");
  const url = readVar(f.file, f.key);
  if (!url) throw new Error(`${f.key} not found in ${f.file}`);
  const host = new URL(url).hostname;
  console.log(`database host: ${host}`);
  console.log(f.apply ? "MODE: APPLY" : "MODE: dry run (writes nothing)");
  if (f.apply && f.confirmHost !== host) {
    throw new Error(`--apply needs --confirm-host ${host} (got ${f.confirmHost ?? "nothing"})`);
  }
  if (f.apply && /production/i.test(f.file) && !f.production) {
    throw new Error("REFUSED: a production secrets file also needs --production (staging first)");
  }

  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  try {
    const vendor = await p.vendor.findUnique({
      where: { slug: f.vendorSlug },
      select: { id: true },
    });
    if (!vendor) throw new Error(`no vendor with slug ${f.vendorSlug}`);
    const vendorId = vendor.id;

    const offers = await p.product.findMany({
      where: {
        vendorId,
        OR: [
          { priceTier: { isActive: true } },
          { attributeValues: { some: { attribute: { slug: "offer-type" } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        basePrice: true,
        isActive: true,
        restriction: true,
        inventory: { select: { stockMode: true } },
        category: {
          select: {
            id: true,
            name: true,
            isActive: true,
            parent: { select: { id: true, name: true, isActive: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    const blocked = offers.filter((o) => blockReason(o) !== null);
    const ok = offers.filter((o) => blockReason(o) === null);
    const activated = new Set(ok.map((o) => o.id));

    const categoryIds = new Map<string, string>();
    for (const o of ok) {
      categoryIds.set(o.category.id, o.category.name);
      if (o.category.parent) categoryIds.set(o.category.parent.id, o.category.parent.name);
    }
    const bundles = await p.bundle.findMany({
      where: { vendorId, items: { some: { productId: { in: [...activated] } } } },
      select: { id: true, slug: true, isActive: true, items: { select: { productId: true } } },
    });
    const qualifying = bundles.filter((b) =>
      bundleQualifies(
        b.items.map((i) => i.productId),
        activated,
      ),
    );
    const promos = await p.promotion.findMany({
      where: {
        vendorId,
        OR: [
          { bundleId: { in: qualifying.map((b) => b.id) } },
          { categoryId: { in: [...categoryIds.keys()] } },
        ],
      },
      select: { id: true, headline: true, isActive: true },
    });

    console.log(
      `\noffer products: ${offers.length}; to switch on: ${ok.filter((o) => !o.isActive).length} (already on: ${ok.filter((o) => o.isActive).length})`,
    );
    for (const o of ok)
      console.log(
        `  ${o.isActive ? "on " : "ON+"} ${o.name}  [${o.category.name}]  stock ${o.inventory?.stockMode ?? "none"}`,
      );
    for (const o of blocked) console.log(`  SKIP ${o.name}: ${blockReason(o)}`);
    console.log(`departments to switch on: ${[...categoryIds.values()].join(", ")}`);
    console.log(`bundles to switch on: ${qualifying.map((b) => b.slug).join(", ") || "none"}`);
    console.log(`promotions to switch on: ${promos.map((x) => x.headline).join(" | ") || "none"}`);
    if (!f.apply) {
      console.log(`\ndry run only. To apply: --apply --confirm-host ${host}`);
      return;
    }

    const ids = [...activated];
    await p.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: { vendorId, id: { in: ids }, restriction: null },
        data: { isActive: true },
      });
      await tx.inventory.updateMany({
        where: { vendorId, productId: { in: ids }, stockMode: "UNKNOWN" },
        data: { stockMode: "UNTRACKED" },
      });
      await tx.category.updateMany({
        where: { vendorId, id: { in: [...categoryIds.keys()] } },
        data: { isActive: true },
      });
      await tx.bundle.updateMany({
        where: { vendorId, id: { in: qualifying.map((b) => b.id) } },
        data: { isActive: true },
      });
      await tx.promotion.updateMany({
        where: { vendorId, id: { in: promos.map((x) => x.id) } },
        data: { isActive: true },
      });
    });
    const missingInventory = ok.filter((o) => !o.inventory).map((o) => o.name);
    console.log(
      `\nAPPLIED: ${ids.length} product(s) on, ${categoryIds.size} department(s), ${qualifying.length} bundle(s), ${promos.length} promotion(s)` +
        (missingInventory.length
          ? `\nWARNING: no stock row (not buyable until one exists): ${missingInventory.join(", ")}`
          : ""),
    );
  } finally {
    await p.$disconnect();
  }
}

if (process.argv[1]?.endsWith("catalogue-activate-offers.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
