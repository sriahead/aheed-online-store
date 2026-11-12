import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { readVar } from "./aheed-data-inventory";

/**
 * #1523 — apply the client's "Stock to upload" list (a POS export) to products that ALREADY exist.
 *
 *   npx tsx scripts/catalogue-apply-stock-list.ts <secrets file> <URL key> --vendor-slug <slug> \
 *     --list <json> [--apply --confirm-host <db host>] [--production]
 *
 * The list is the client's data and lives outside the repository (`.import-reports/`). Each row is
 * one spreadsheet line with the EXACT product name(s) it maps to (or a PLU), curated by a person
 * against the catalogue, because the spreadsheet's spellings ("Pangasus filler", "Bottle guard")
 * are not the catalogue's. A name matching no product, or more than one, is skipped and reported,
 * never guessed.
 *
 * PER MATCHED PRODUCT:
 *  - category → the row's target (`categoryMap["<Dept>|<SubDept>"]`, a slug that MUST already exist;
 *    `null` keeps the current category). This script never creates a category or a product.
 *  - stock mode → UNTRACKED, with an InventoryAuditLog row (EXCEL_IMPORT) when it changes, so staff
 *    can start counting it themselves (owner instruction 2026-11-11).
 *  - switched on ONLY when it has a price (basePrice > 0) and no restriction. A £0 line stays hidden
 *    and is reported "price needed". A restricted line cannot be active at all
 *    (`Product_restricted_inactive_check`). Nothing is ever switched off.
 *
 * Dry run by default; `--apply` needs `--confirm-host`; a production secrets file also needs
 * `--production`. Re-running changes nothing.
 */

export interface StockListRow {
  /** The spreadsheet's own description, for the report. */
  sheetName: string;
  dept: string;
  sub: string;
  /** The spreadsheet's price text, if any, for the report only (never written). */
  sheetPrice?: string | null;
  /** Exact catalogue product names this row maps to. */
  products?: string[];
  /** Or a PLU, for rows the POS export identifies by one. */
  plu?: string;
}

export interface StockList {
  /** "<Dept>|<SubDept>" → category slug, or null to keep each product's current category. */
  categoryMap: Record<string, string | null>;
  rows: StockListRow[];
}

export interface PlanInput {
  basePrice: number;
  restriction: string | null;
  isActive: boolean;
  categoryId: string;
  stockMode: string | null;
}

export type Outcome = "activate" | "already active" | "price needed" | "restricted";

export interface ProductPlan {
  moveCategory: boolean;
  setUntracked: boolean;
  activate: boolean;
  outcome: Outcome;
}

/** Pure: what this script does to one matched product. Never deactivates. */
export function planProduct(p: PlanInput, targetCategoryId: string | null): ProductPlan {
  const moveCategory = targetCategoryId !== null && p.categoryId !== targetCategoryId;
  const setUntracked = p.stockMode !== "UNTRACKED";
  if (p.isActive) return { moveCategory, setUntracked, activate: false, outcome: "already active" };
  if (p.restriction !== null) {
    return { moveCategory, setUntracked, activate: false, outcome: "restricted" };
  }
  if (p.basePrice <= 0) {
    return { moveCategory, setUntracked, activate: false, outcome: "price needed" };
  }
  return { moveCategory, setUntracked, activate: true, outcome: "activate" };
}

/** Pure: every target slug the list names, and the ones the vendor does not have. */
export function unknownCategorySlugs(list: StockList, existing: ReadonlySet<string>): string[] {
  const named = new Set(
    list.rows
      .map((row) => list.categoryMap[`${row.dept}|${row.sub}`])
      .filter((slug): slug is string => typeof slug === "string"),
  );
  return [...named].filter((slug) => !existing.has(slug)).sort();
}

/** Pure: a row whose dept/sub pair is missing from the map is a curation mistake, not "keep". */
export function unmappedRows(list: StockList): StockListRow[] {
  return list.rows.filter((row) => !(`${row.dept}|${row.sub}` in list.categoryMap));
}

function flags(argv: readonly string[]) {
  const at = (flag: string) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);
  return {
    file: argv[0],
    key: argv[1],
    vendorSlug: at("--vendor-slug"),
    list: at("--list"),
    apply: argv.includes("--apply"),
    production: argv.includes("--production"),
    confirmHost: at("--confirm-host"),
  };
}

async function main() {
  const f = flags(process.argv.slice(2));
  if (!f.file || !f.key || !f.vendorSlug || !f.list)
    throw new Error("usage: see the header of scripts/catalogue-apply-stock-list.ts");
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

  const list = JSON.parse(readFileSync(f.list, "utf8")) as StockList;
  const unmapped = unmappedRows(list);
  if (unmapped.length > 0) {
    throw new Error(
      `rows with no categoryMap entry: ${unmapped.map((r) => `${r.dept}|${r.sub}`).join(", ")}`,
    );
  }

  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  try {
    const vendor = await p.vendor.findUnique({
      where: { slug: f.vendorSlug },
      select: { id: true },
    });
    if (!vendor) throw new Error(`vendor ${f.vendorSlug} not found`);
    const vendorId = vendor.id;

    const categories = await p.category.findMany({
      where: { vendorId },
      select: { id: true, slug: true, name: true },
    });
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    const byId = new Map(categories.map((c) => [c.id, c]));
    const unknown = unknownCategorySlugs(list, new Set(bySlug.keys()));
    if (unknown.length > 0) {
      throw new Error(
        `unknown category slug(s) for this vendor: ${unknown.join(", ")} — nothing written`,
      );
    }
    console.log(`categories: ${categories.length}`);

    const counts: Record<string, number> = {};
    const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
    const seen = new Set<string>();

    for (const row of list.rows) {
      const targetSlug = list.categoryMap[`${row.dept}|${row.sub}`];
      const target = targetSlug ? bySlug.get(targetSlug)! : null;
      const names = row.products ?? [];
      const lookups: { label: string; where: { name: string } | { plu: string } }[] = row.plu
        ? [{ label: `PLU ${row.plu}`, where: { plu: row.plu } }]
        : names.map((name) => ({ label: name, where: { name } }));
      if (lookups.length === 0) {
        console.log(`  ${row.sheetName} → skipped (no match): row names no product`);
        bump("skipped (no match)");
        continue;
      }

      for (const { label, where } of lookups) {
        const found = await p.product.findMany({
          where: { vendorId, ...where },
          select: {
            id: true,
            name: true,
            basePrice: true,
            restriction: true,
            isActive: true,
            categoryId: true,
            inventory: { select: { id: true, quantity: true, stockMode: true } },
          },
        });
        if (found.length !== 1) {
          const why = found.length === 0 ? "skipped (no match)" : "skipped (ambiguous)";
          console.log(`  ${row.sheetName} → ${label}: ${why} (${found.length} products)`);
          bump(why);
          continue;
        }
        const product = found[0];
        if (seen.has(product.id)) continue; // a spreadsheet line repeated
        seen.add(product.id);

        const plan = planProduct(
          { ...product, stockMode: product.inventory?.stockMode ?? null },
          target?.id ?? null,
        );
        const from = byId.get(product.categoryId)?.slug ?? "?";
        const to = target?.slug ?? from;
        const price = `£${(product.basePrice / 100).toFixed(2)}`;
        const sheet = row.sheetPrice ? ` (sheet ${row.sheetPrice})` : "";
        console.log(
          `  ${row.sheetName} → ${product.name} [${price}${sheet}] ${from}${plan.moveCategory ? ` → ${to}` : ""}` +
            ` | stock ${product.inventory?.stockMode ?? "none"}${plan.setUntracked ? " → UNTRACKED" : ""} | ${plan.outcome}`,
        );
        bump(plan.outcome);
        if (plan.moveCategory) bump("category moved");
        if (plan.setUntracked) bump("stock set untracked");

        if (!f.apply || (!plan.moveCategory && !plan.setUntracked && !plan.activate)) continue;

        await p.$transaction(async (tx) => {
          // Stock first: a product is never switched on with stock UNKNOWN (#1211).
          if (plan.setUntracked) {
            const prevMode = product.inventory?.stockMode ?? "UNKNOWN";
            const prevQty = product.inventory?.quantity ?? 0;
            const inv = await tx.inventory.upsert({
              where: { productId: product.id },
              create: { vendorId, productId: product.id, quantity: 0, stockMode: "UNTRACKED" },
              update: { stockMode: "UNTRACKED", version: { increment: 1 } },
            });
            await tx.inventoryAuditLog.create({
              data: {
                vendorId,
                productId: product.id,
                inventoryId: inv.id,
                previousQuantity: prevQty,
                newQuantity: inv.quantity,
                changeAmount: inv.quantity - prevQty,
                previousStockMode: prevMode,
                newStockMode: "UNTRACKED",
                source: "EXCEL_IMPORT",
                reason: "Stock to upload list (#1523): stock not tracked; staff set counts",
                actorType: "SYSTEM",
              },
            });
          }
          if (plan.moveCategory || plan.activate) {
            await tx.product.update({
              where: { id: product.id },
              data: {
                ...(plan.moveCategory && target ? { categoryId: target.id } : {}),
                ...(plan.activate ? { isActive: true } : {}),
              },
            });
          }
        });
      }
    }

    const after = await p.category.count({ where: { vendorId } });
    console.log(`\nsummary: ${JSON.stringify(counts)}`);
    console.log(`categories before ${categories.length}, after ${after}`);
    console.log(
      f.apply
        ? "APPLIED."
        : `\nDRY RUN — nothing written. To apply: --apply --confirm-host ${host}`,
    );
  } finally {
    await p.$disconnect();
  }
}

if (process.argv[1]?.endsWith("catalogue-apply-stock-list.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
