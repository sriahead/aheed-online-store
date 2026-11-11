import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { readVar } from "./aheed-data-inventory";

/**
 * #1517 — build a cell's offer bundles, the promotion banners that link to them, and the
 * `Offer Type` filter, from a data file kept outside the repository.
 *
 *   npx tsx scripts/catalogue-offer-bundles.ts <secrets file> <URL key> --vendor-slug <slug> --data <json>
 *   … --apply --confirm-host <db host> [--production]
 *
 * Bundles are upserted by slug and their items replaced; a NEW bundle is created inactive, an
 * existing one keeps its active flag. A promotion is matched by headline: it is pointed at its
 * bundle (`bundleId` set, `linkUrl` and `categoryId` cleared, so the banner lands on
 * `/bundles/<slug>` as "Buy This Offer"); a new one is created inactive. `Offer Type` is a LIST
 * vendor attribute: `Multi-Buy` goes on every product with an active price tier, `Box Offer` on the
 * named box products, so the existing vendor-filter chips (#912) can filter by it. Every step is an
 * upsert, so a re-run changes nothing. Dry run by default; `--apply` needs `--confirm-host`; a
 * production secrets file also needs `--production`.
 */

export interface OfferData {
  bundles: {
    slug: string;
    name: string;
    tagline?: string;
    items: { product: string; quantity: number }[];
  }[];
  promotions: { headline: string; subtitle?: string; badgeText?: string; bundle: string }[];
  offerType: {
    name: string;
    slug: string;
    options: { slug: string; name: string }[];
    boxOfferProducts: string[];
  };
}

/** Every product name the data file refers to, for an up-front existence check. */
export function referencedProducts(data: OfferData): string[] {
  return [
    ...new Set([
      ...data.bundles.flatMap((b) => b.items.map((i) => i.product)),
      ...data.offerType.boxOfferProducts,
    ]),
  ];
}

/** Problems a person must fix in the data file before anything is written. */
export function validate(data: OfferData): string[] {
  const problems: string[] = [];
  const slugs = new Set(data.bundles.map((b) => b.slug));
  if (slugs.size !== data.bundles.length) problems.push("a bundle slug appears twice");
  for (const b of data.bundles) {
    if (b.items.length === 0) problems.push(`bundle ${b.slug} has no items`);
    for (const i of b.items)
      if (!(i.quantity >= 1)) problems.push(`bundle ${b.slug}: ${i.product} quantity < 1`);
  }
  for (const p of data.promotions) {
    if (!slugs.has(p.bundle))
      problems.push(`promotion "${p.headline}" names unknown bundle ${p.bundle}`);
  }
  return problems;
}

function flags(argv: readonly string[]) {
  const at = (flag: string) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);
  return {
    file: argv[0],
    key: argv[1],
    vendorSlug: at("--vendor-slug"),
    dataPath: at("--data"),
    apply: argv.includes("--apply"),
    production: argv.includes("--production"),
    confirmHost: at("--confirm-host"),
  };
}

async function main() {
  const f = flags(process.argv.slice(2));
  if (!f.file || !f.key || !f.vendorSlug || !f.dataPath) {
    throw new Error("usage: see the header of scripts/catalogue-offer-bundles.ts");
  }
  const data = JSON.parse(readFileSync(f.dataPath, "utf8")) as OfferData;
  const problems = validate(data);
  if (problems.length) throw new Error(`fix the data file first:\n  ${problems.join("\n  ")}`);
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
    const names = referencedProducts(data);
    const products = await p.product.findMany({
      where: { vendorId, name: { in: names } },
      select: {
        id: true,
        name: true,
        basePrice: true,
        priceTier: { select: { groupQuantity: true, groupPricePence: true, isActive: true } },
      },
    });
    const byName = new Map<string, (typeof products)[number][]>();
    for (const prod of products) byName.set(prod.name, [...(byName.get(prod.name) ?? []), prod]);
    const missing = names.filter((n) => !byName.has(n));
    const dupes = names.filter((n) => (byName.get(n)?.length ?? 0) > 1);
    if (missing.length || dupes.length) {
      throw new Error(
        `product names must match exactly one product. Missing: ${missing.join(", ") || "none"}; ambiguous: ${dupes.join(", ") || "none"}`,
      );
    }
    const multiBuy = await p.product.findMany({
      where: { vendorId, priceTier: { isActive: true } },
      select: { id: true, name: true },
    });

    for (const b of data.bundles) {
      const lines = b.items.map((i) => `${i.quantity} × ${i.product}`).join(", ");
      console.log(`  bundle ${b.slug}: ${b.name} — ${lines}`);
    }
    for (const pr of data.promotions)
      console.log(`  promotion "${pr.headline}" → /bundles/${pr.bundle}`);
    console.log(
      `  ${data.offerType.name}: Multi-Buy on ${multiBuy.length} product(s), Box Offer on ${data.offerType.boxOfferProducts.length}`,
    );
    if (!f.apply) {
      console.log(`\ndry run only. To apply: --apply --confirm-host ${host}`);
      return;
    }

    const bundleId = new Map<string, string>();
    for (const [index, b] of data.bundles.entries()) {
      const existing = await p.bundle.findUnique({
        where: { vendorId_slug: { vendorId, slug: b.slug } },
        select: { id: true },
      });
      const row = existing
        ? await p.bundle.update({
            where: { id: existing.id },
            data: { name: b.name, tagline: b.tagline ?? null, sortOrder: index * 10 },
            select: { id: true },
          })
        : await p.bundle.create({
            data: {
              vendorId,
              slug: b.slug,
              name: b.name,
              tagline: b.tagline ?? null,
              sortOrder: index * 10,
              isActive: false,
            },
            select: { id: true },
          });
      bundleId.set(b.slug, row.id);
      await p.$transaction(async (tx) => {
        await tx.bundleItem.deleteMany({ where: { bundleId: row.id } });
        await tx.bundleItem.createMany({
          data: b.items.map((i, sortOrder) => ({
            bundleId: row.id,
            productId: byName.get(i.product)![0].id,
            quantity: i.quantity,
            sortOrder,
          })),
        });
      });
    }

    let promosCreated = 0;
    for (const pr of data.promotions) {
      const target = bundleId.get(pr.bundle)!;
      const existing = await p.promotion.findFirst({
        where: { vendorId, headline: pr.headline },
        select: { id: true },
      });
      const fields = {
        subtitle: pr.subtitle ?? null,
        badgeText: pr.badgeText ?? null,
        bundleId: target,
        linkUrl: null,
        categoryId: null,
      };
      if (existing) {
        await p.promotion.update({ where: { id: existing.id }, data: fields });
      } else {
        await p.promotion.create({
          data: { vendorId, headline: pr.headline, isActive: false, ...fields },
        });
        promosCreated += 1;
      }
    }

    const ot = data.offerType;
    const attribute = await p.vendorAttribute.upsert({
      where: { vendorId_slug: { vendorId, slug: ot.slug } },
      create: { vendorId, slug: ot.slug, name: ot.name, kind: "LIST" },
      update: { name: ot.name },
      select: { id: true },
    });
    const optionId = new Map<string, string>();
    for (const [sortOrder, o] of ot.options.entries()) {
      const opt = await p.vendorAttributeOption.upsert({
        where: { attributeId_slug: { attributeId: attribute.id, slug: o.slug } },
        create: { attributeId: attribute.id, slug: o.slug, name: o.name, sortOrder },
        update: { name: o.name, sortOrder },
        select: { id: true },
      });
      optionId.set(o.slug, opt.id);
    }
    const assignments = [
      ...multiBuy.map((m) => ({ productId: m.id, option: "multi-buy" })),
      ...ot.boxOfferProducts.map((n) => ({ productId: byName.get(n)![0].id, option: "box-offer" })),
    ];
    for (const a of assignments) {
      await p.productAttributeValue.upsert({
        where: { productId_attributeId: { productId: a.productId, attributeId: attribute.id } },
        create: {
          vendorId,
          productId: a.productId,
          attributeId: attribute.id,
          optionId: optionId.get(a.option)!,
        },
        update: { optionId: optionId.get(a.option)! },
      });
    }
    console.log(
      `\nAPPLIED: ${data.bundles.length} bundle(s) set, ${data.promotions.length} promotion(s) linked (${promosCreated} new, inactive), ${assignments.length} Offer Type value(s)`,
    );
  } finally {
    await p.$disconnect();
  }
}

if (process.argv[1]?.endsWith("catalogue-offer-bundles.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
