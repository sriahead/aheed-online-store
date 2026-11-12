import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { slugify } from "@/lib/catalogue-form";
import { readVar } from "./aheed-data-inventory";

/**
 * Aheed catalogue S1 (#1330) — load the owner's price list (fresh chicken, meat, fish, seafood, fruit
 * and veg) as the MAIN data: a listed product that already exists is overridden, the rest created.
 *
 *   npx tsx scripts/catalogue-load-price-list.ts <secrets file> <URL key> --vendor-slug <slug> --list <json>
 *   … --apply --confirm-host <db host> [--production]
 *
 * The list is the client's commercial data and lives outside the repository (`.import-reports/`).
 *
 * MATCHING. A list item overrides an existing product when the two names hold the same set of words
 * (case, punctuation and order ignored — "Royal Squid" = "SQUID ROYAL"), or when one of the item's
 * `aliases` does. Two or more matches is ambiguous: the item is skipped and reported, never guessed.
 * Near misses (sharing two significant words) are listed for a person to merge or leave.
 *
 * WRITES. Override: name, price and price label (a missing price keeps the old one), department,
 * brand, and fresh/halal set where the list says so; the PLU, active flag and restriction are kept.
 * Create: hidden (`isActive: false`) with the default stock row; an item with no price is created at
 * £0 and listed as "price needed" — S1e never switches on a £0 line. `offer` → the product's
 * multi-buy price tier. Brands are upserted by slug. Promotions are created INACTIVE (go-live is S1e)
 * and linked to their department. Dry run by default; `--apply` needs `--confirm-host`; a production
 * secrets file also needs `--production`.
 */

export interface PriceListItem {
  name: string;
  price: number | null;
  unit: "each" | "kg";
  category: string;
  brand?: string;
  fresh?: boolean;
  halal?: boolean;
  offer?: { qty: number; price: number };
  aliases?: string[];
  boxOffer?: boolean;
  note?: string;
}
export interface PriceList {
  brands: string[];
  items: PriceListItem[];
  promotions: { headline: string; subtitle?: string; badgeText?: string; category: string }[];
}

const NOISE = new Set(["THE", "AND", "OF", "PER", "KG", "G", "BAG", "PACK", "BOX", "EACH"]);

/** The set of words in a name, for order-insensitive matching. */
export function wordSet(name: string): string {
  return [
    ...new Set(
      name
        .normalize("NFKD")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim()
        .split(" ")
        .filter(Boolean),
    ),
  ]
    .sort()
    .join(" ");
}

/** Words that carry meaning (no sizes, numbers or packaging words) — for near-miss hints only. */
export function significantWords(name: string): string[] {
  return wordSet(name)
    .split(" ")
    .filter((w) => w.length > 2 && !/^\d/.test(w) && !NOISE.has(w));
}

export function priceLabel(pence: number, unit: "each" | "kg"): string {
  const pounds = `£${(pence / 100).toFixed(2)}`;
  return unit === "kg" ? `${pounds} / kg` : pounds;
}

function flags(argv: readonly string[]) {
  const at = (flag: string) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);
  return {
    file: argv[0],
    key: argv[1],
    vendorSlug: at("--vendor-slug"),
    listPath: at("--list"),
    apply: argv.includes("--apply"),
    production: argv.includes("--production"),
    confirmHost: at("--confirm-host"),
  };
}

async function main() {
  const f = flags(process.argv.slice(2));
  if (!f.file || !f.key || !f.vendorSlug || !f.listPath) {
    throw new Error("usage: see the header of scripts/catalogue-load-price-list.ts");
  }
  const list = JSON.parse(readFileSync(f.listPath, "utf8")) as PriceList;
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
    const [categories, products, brands] = await Promise.all([
      p.category.findMany({ where: { vendorId }, select: { id: true, slug: true } }),
      p.product.findMany({
        where: { vendorId },
        select: { id: true, name: true, slug: true, basePrice: true },
      }),
      p.brand.findMany({ where: { vendorId }, select: { id: true, slug: true } }),
    ]);
    const catId = new Map(categories.map((c) => [c.slug, c.id]));
    const missingCats = [...new Set(list.items.map((i) => i.category))].filter(
      (s) => !catId.has(s),
    );
    if (missingCats.length)
      throw new Error(
        `unknown department slug(s): ${missingCats.join(", ")} — run the taxonomy first`,
      );
    const byWords = new Map<string, typeof products>();
    for (const prod of products) {
      const k = wordSet(prod.name);
      byWords.set(k, [...(byWords.get(k) ?? []), prod]);
    }

    type Planned = {
      item: PriceListItem;
      match: (typeof products)[number] | null;
      ambiguous: string[];
      near: string[];
      duplicates?: string[];
    };
    const planned: Planned[] = list.items.map((item) => {
      const keys = [item.name, ...(item.aliases ?? [])].map(wordSet);
      const hits = [
        ...new Map(keys.flatMap((k) => byWords.get(k) ?? []).map((x) => [x.id, x])).values(),
      ];
      // Two rows with the SAME name are a duplicate in the till, not two candidates: override the
      // first, list the rest for a person. Different names that both match stay ambiguous.
      if (hits.length > 1 && new Set(hits.map((h) => wordSet(h.name))).size === 1) {
        return {
          item,
          match: hits[0],
          ambiguous: [],
          near: [],
          duplicates: hits.slice(1).map((h) => `${h.name} [${h.slug}]`),
        };
      }
      if (hits.length > 1)
        return { item, match: null, ambiguous: hits.map((h) => h.name), near: [] };
      if (hits.length === 1) return { item, match: hits[0], ambiguous: [], near: [] };
      const sig = significantWords(item.name);
      const near =
        sig.length >= 2
          ? products
              .filter((x) => {
                const w = new Set(significantWords(x.name));
                return sig.filter((s) => w.has(s)).length >= Math.min(2, sig.length);
              })
              .slice(0, 4)
              .map((x) => `${x.name} (£${(x.basePrice / 100).toFixed(2)})`)
          : [];
      return { item, match: null, ambiguous: [], near };
    });

    const overrides = planned.filter((x) => x.match);
    const creates = planned.filter((x) => !x.match && x.ambiguous.length === 0);
    const ambiguous = planned.filter((x) => x.ambiguous.length > 0);
    console.log(
      `\nitems: ${list.items.length}; override existing: ${overrides.length}; create: ${creates.length}; ambiguous (skipped): ${ambiguous.length}`,
    );
    for (const x of overrides) console.log(`  override  "${x.match!.name}" → "${x.item.name}"`);
    for (const x of ambiguous)
      console.log(`  AMBIGUOUS "${x.item.name}" matches ${x.ambiguous.join(" | ")}`);
    for (const x of overrides.filter((o) => o.duplicates?.length))
      console.log(
        `  DUPLICATE in the till, left as is: ${x.duplicates!.join(" | ")} (same name as "${x.item.name}")`,
      );
    const withNear = creates.filter((x) => x.near.length);
    if (withNear.length)
      console.log("\nnear misses (created as new; merge later if they are the same item):");
    for (const x of withNear) console.log(`  "${x.item.name}"  ~  ${x.near.join(" | ")}`);
    const noPrice = list.items.filter((i) => i.price === null);
    console.log(`\nprice needed (${noPrice.length}): ${noPrice.map((i) => i.name).join(", ")}`);
    const notes = list.items.filter((i) => i.note);
    for (const i of notes) console.log(`  note: ${i.name} — ${i.note}`);
    console.log(
      `offers (multi-buy tiers): ${list.items.filter((i) => i.offer).length}; box-offer products: ${list.items.filter((i) => i.boxOffer).length}; promotions (inactive): ${list.promotions.length}`,
    );
    if (!f.apply) {
      console.log(`\ndry run only. To apply: --apply --confirm-host ${host}`);
      return;
    }

    const brandId = new Map(brands.map((b) => [b.slug, b.id]));
    for (const name of list.brands) {
      const slug = slugify(name);
      if (!brandId.has(slug)) {
        const b = await p.brand.create({ data: { vendorId, name, slug }, select: { id: true } });
        brandId.set(slug, b.id);
      }
    }
    const usedSlugs = new Set(products.map((x) => x.slug));
    const uniqueSlug = (name: string) => {
      const base = slugify(name);
      let s = base;
      for (let n = 2; usedSlugs.has(s); n++) s = `${base}-${n}`;
      usedSlugs.add(s);
      return s;
    };
    let created = 0;
    let updated = 0;
    let tiers = 0;
    for (const x of [...overrides, ...creates]) {
      const i = x.item;
      const common = {
        name: i.name,
        categoryId: catId.get(i.category)!,
        brandId: i.brand ? brandId.get(slugify(i.brand))! : undefined,
        ...(i.fresh ? { isFresh: true } : {}),
        ...(i.halal ? { isHalal: true } : {}),
      };
      let productId: string;
      if (x.match) {
        await p.product.update({
          where: { id: x.match.id },
          data: {
            ...common,
            ...(i.price !== null
              ? { basePrice: i.price, unitLabel: priceLabel(i.price, i.unit) }
              : {}),
          },
        });
        productId = x.match.id;
        updated += 1;
      } else {
        const prod = await p.product.create({
          data: {
            vendorId,
            slug: uniqueSlug(i.name),
            description: "",
            basePrice: i.price ?? 0,
            unitLabel: priceLabel(i.price ?? 0, i.unit),
            isActive: false,
            ...common,
            inventory: { create: { vendorId } },
          },
          select: { id: true },
        });
        productId = prod.id;
        created += 1;
      }
      if (i.offer) {
        await p.productPriceTier.upsert({
          where: { productId },
          create: {
            vendorId,
            productId,
            groupQuantity: i.offer.qty,
            groupPricePence: i.offer.price,
          },
          update: { groupQuantity: i.offer.qty, groupPricePence: i.offer.price, isActive: true },
        });
        tiers += 1;
      }
    }
    let promos = 0;
    for (const promo of list.promotions) {
      const exists = await p.promotion.findFirst({
        where: { vendorId, headline: promo.headline },
        select: { id: true },
      });
      if (exists) continue;
      await p.promotion.create({
        data: {
          vendorId,
          headline: promo.headline,
          subtitle: promo.subtitle,
          badgeText: promo.badgeText,
          categoryId: catId.get(promo.category),
          linkUrl: `/categories/${promo.category}`,
          isActive: false,
        },
      });
      promos += 1;
    }
    console.log(
      `\nAPPLIED: ${updated} overridden, ${created} created (hidden), ${tiers} multi-buy tiers, ${promos} promotions (inactive)`,
    );
  } finally {
    await p.$disconnect();
  }
}

if (process.argv[1]?.endsWith("catalogue-load-price-list.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
