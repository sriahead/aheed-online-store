import type { Prisma } from "@prisma/client";
import type { getPrisma, getPrismaWs } from "@/lib/db";
import { deriveUnitPricePenceForSort } from "@/components/product/unit-price";
import { formatPrice } from "@/components/product/format-price";
import { slugify } from "@/lib/catalogue-form";
import { readLowStockDefault } from "@/lib/repositories/vendor";
import type { CatalogueProduct } from "@/lib/stock-import/match";
import { computeChanges, unitLabelFor, type MergeOptions } from "@/lib/stock-import/merge";
import { withTillWords } from "@/lib/stock-import/naming";
import { normaliseFile, type NormalisedRow } from "@/lib/stock-import/normalise";
import { buildPlan, targetsFor, type PlanLookups } from "@/lib/stock-import/plan";
import type { StockImportProfile } from "@/lib/stock-import/profile";
import { isPresetName, type PresetName } from "@/lib/stock-import/presets";
import {
  changesFor,
  planRestore,
  TRACKED_FIELDS,
  type FieldChangeRecord,
  type TrackedField,
} from "@/lib/stock-import/field-change";
import {
  buildLookups,
  cellsToGrid,
  gridToCells,
  plannedLineData,
} from "@/lib/stock-import/run-lines";
import { profileFromSettings, type ImportSettingsData } from "@/lib/stock-import/settings";

/**
 * #1578 — the stock import's database half, shared by the staff screen (`/staff/products/import`)
 * and the CLI (`scripts/stock-import.ts`). Every export takes its client and vendorId.
 *
 * NOTHING HERE MAKES ANYTHING LIVE: a created product is hidden with stock UNKNOWN; created brands,
 * categories, price tiers, bundles and promotions follow #1570's rules (categories, tiers, bundles
 * and promotions inactive); an existing product's isActive, restriction and slug are never written.
 *
 * Writes that open a transaction or use createMany/updateMany take the WebSocket client.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;
type Tx = Prisma.TransactionClient;

const NO_OVERWRITE: MergeOptions = { overwriteEdited: false, updateLivePrices: false };
/** A claim older than this is a chunk that died mid-apply; its lines may be taken again. */
const STALE_CLAIM_MS = 10 * 60 * 1000;
export const MAX_IMPORT_ROWS = 2_000;
export const APPLY_CHUNK = 20;

const pounds = (p: number | null | undefined) => (p == null ? "" : formatPrice(p));

// ---- Store ------------------------------------------------------------------------------

export const CATALOGUE_SELECT = {
  id: true,
  slug: true,
  name: true,
  plu: true,
  barcode: true,
  brandId: true,
  brand: { select: { name: true } },
  categoryId: true,
  category: { select: { slug: true, name: true } },
  basePrice: true,
  originalPrice: true,
  unitLabel: true,
  netContentAmount: true,
  netContentUnit: true,
  description: true,
  isActive: true,
  vatRate: true,
  origin: true,
  isHalal: true,
  isVegetarian: true,
  isOrganic: true,
  isGlutenFree: true,
  isFresh: true,
  manuallyEditedFields: true,
  unitPricePencePerBaseUnit: true,
} as const;

export type ImportProduct = CatalogueProduct & { unitPricePencePerBaseUnit: number | null };

type CatalogueRow = Prisma.ProductGetPayload<{ select: typeof CATALOGUE_SELECT }>;

function toCatalogue({ brand, category, ...rest }: CatalogueRow): ImportProduct {
  return {
    ...rest,
    netContentAmount: rest.netContentAmount === null ? null : Number(rest.netContentAmount),
    brandName: brand?.name ?? null,
    categorySlug: category.slug,
    categoryName: category.name,
  } as ImportProduct;
}

export interface ImportStore {
  vendorId: string;
  vendorSlug: string;
  catalogue: ImportProduct[];
  brands: { id: string; name: string; slug: string }[];
  categories: { id: string; slug: string; name: string; isActive: boolean }[];
}

export async function loadImportStore(db: Db | DbWs, vendorId: string): Promise<ImportStore> {
  const [vendor, brands, categories, products] = await Promise.all([
    db.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { slug: true } }),
    db.brand.findMany({ where: { vendorId }, select: { id: true, name: true, slug: true } }),
    db.category.findMany({
      where: { vendorId },
      select: { id: true, slug: true, name: true, isActive: true },
    }),
    db.product.findMany({ where: { vendorId }, select: CATALOGUE_SELECT }),
  ]);
  return {
    vendorId,
    vendorSlug: vendor.slug,
    catalogue: products.map(toCatalogue),
    brands,
    categories,
  };
}

export async function loadImportProducts(
  db: Db | DbWs,
  vendorId: string,
  ids: readonly string[],
): Promise<Map<string, ImportProduct>> {
  if (ids.length === 0) return new Map();
  const rows = await db.product.findMany({
    where: { vendorId, id: { in: [...new Set(ids)] } },
    select: CATALOGUE_SELECT,
  });
  return new Map(rows.map((r) => [r.id, toCatalogue(r)]));
}

/** Product id → the name it had before an import first renamed it (#1573's till words). */
export async function readTillNames(db: Db | DbWs, vendorId: string): Promise<Map<string, string>> {
  const rows = await db.stockImportFieldChange.findMany({
    where: { field: "name", product: { vendorId }, previousValue: { not: null } },
    select: { productId: true, previousValue: true },
    orderBy: { line: { appliedAt: "asc" } },
  });
  const out = new Map<string, string>();
  for (const r of rows) if (!out.has(r.productId)) out.set(r.productId, r.previousValue as string);
  return out;
}

// ---- Applying one line (screen and CLI) -----------------------------------------------------

export type AttributeIds = Map<string, { id: string; options: Map<string, string> }>;

/** Brands, categories (inactive), filters and options the rows need: reused, else created. */
export async function ensureMasterData(
  db: DbWs,
  vendorId: string,
  rows: readonly NormalisedRow[],
  lookups: PlanLookups,
): Promise<{ attributeIds: AttributeIds; created: string[] }> {
  const created: string[] = [];
  for (const name of new Set(rows.map((r) => r.brand).filter((b): b is string => !!b))) {
    if (lookups.brandIds.has(name.toLowerCase())) continue;
    const slug = slugify(name);
    const brand =
      (await db.brand.findUnique({
        where: { vendorId_slug: { vendorId, slug } },
        select: { id: true },
      })) ?? (await db.brand.create({ data: { vendorId, name, slug }, select: { id: true } }));
    lookups.brandIds.set(name.toLowerCase(), brand.id);
    created.push(`brand ${name}`);
  }
  for (const row of rows) {
    const cat = row.category;
    if (lookups.categories.has(cat.slug)) continue;
    if (!("newName" in cat))
      throw new Error(`category "${cat.slug}" (from the import settings) does not exist`);
    const category = await db.category.create({
      data: { vendorId, slug: cat.slug, name: cat.newName, parentId: null, isActive: false },
      select: { id: true },
    });
    lookups.categories.set(cat.slug, { id: category.id, name: cat.newName });
    created.push(`category ${cat.newName} (inactive)`);
  }
  const attributeIds: AttributeIds = new Map();
  for (const name of new Set(rows.flatMap((r) => Object.keys(r.attributes)))) {
    const slug = slugify(name);
    let attr = await db.vendorAttribute.findUnique({
      where: { vendorId_slug: { vendorId, slug } },
      select: { id: true, options: { select: { id: true, slug: true } } },
    });
    if (!attr) {
      attr = await db.vendorAttribute.create({
        data: { vendorId, name, slug, kind: "LIST" },
        select: { id: true, options: { select: { id: true, slug: true } } },
      });
      created.push(`filter ${name}`);
    }
    attributeIds.set(name, {
      id: attr.id,
      options: new Map(attr.options.map((o) => [o.slug, o.id])),
    });
  }
  for (const row of rows) {
    for (const [name, option] of Object.entries(row.attributes)) {
      const attr = attributeIds.get(name);
      if (!attr) continue;
      const slug = slugify(option);
      if (attr.options.has(slug)) continue;
      const opt = await db.vendorAttributeOption.create({
        data: { attributeId: attr.id, name: option, slug, sortOrder: attr.options.size },
        select: { id: true },
      });
      attr.options.set(slug, opt.id);
      created.push(`option ${name}: ${option}`);
    }
  }
  return { attributeIds, created };
}

export interface ApplyContext {
  batchId: string;
  profile: StockImportProfile;
  knownBrands: readonly string[];
  lookups: PlanLookups;
  attributeIds: AttributeIds;
  options: MergeOptions;
  /** Product id → its name before an earlier import renamed it. */
  tillNames: ReadonlyMap<string, string>;
  /** Slugs in use; a created product's slug is added. */
  slugs: Set<string>;
}

export interface LineWork {
  /** The row as the list names it (an UPDATE adds the target's till words itself). */
  row: NormalisedRow;
  decision: "UPDATE" | "CREATE";
  /** The product as it is now (UPDATE only). */
  target: ImportProduct | null;
  note: string;
}

export interface LineOutcome {
  action: "created" | "updated" | "unchanged";
  productId: string;
  name: string;
  detail: string;
  changes: FieldChangeRecord[];
}

function uniqueSlug(slugs: Set<string>, name: string): string {
  const base = slugify(name).slice(0, 90) || "product";
  let slug = base;
  for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
  slugs.add(slug);
  return slug;
}

/**
 * Write one decided line: an UPDATE of `target` or a hidden CREATE, each in its own transaction.
 * Throws on failure; the caller records it and carries on with the next line.
 */
export async function applyLine(
  db: DbWs,
  vendorId: string,
  ctx: ApplyContext,
  work: LineWork,
): Promise<LineOutcome> {
  const { lookups, profile } = ctx;
  // #1573 — an UPDATE takes till words from the product it updates, whether the plan matched it
  // or a reviewer chose it; building from the list's name would undo an earlier till-word rename.
  const row =
    work.decision === "UPDATE" && work.target
      ? withTillWords(
          work.row,
          work.target,
          ctx.tillNames.get(work.target.id) ?? work.target.name,
          profile,
          ctx.knownBrands,
        ).row
      : work.row;
  const targets = targetsFor(row, lookups);
  const categoryId = targets.categoryId as string;

  if (work.decision === "UPDATE") {
    const target = work.target;
    if (!target) throw new Error("the product to update no longer exists");
    const { changes, kept } = computeChanges(row, target, targets, profile, ctx.options);
    const data: Prisma.ProductUncheckedUpdateInput = {};
    let price = target.basePrice;
    let net =
      target.netContentAmount !== null && target.netContentUnit !== null
        ? { amount: target.netContentAmount, unit: target.netContentUnit }
        : null;
    for (const c of changes) {
      switch (c.field) {
        case "name":
          data.name = row.displayName;
          break;
        case "basePrice":
          data.basePrice = price = row.pricePence as number;
          break;
        case "originalPrice":
          data.originalPrice = row.wasPricePence;
          break;
        case "netContent":
          net = row.netContent;
          data.netContentAmount = net?.amount ?? null;
          data.netContentUnit = net?.unit ?? null;
          break;
        case "unitLabel":
          data.unitLabel = unitLabelFor(row.pricePence as number);
          break;
        case "brandId":
          data.brandId =
            targets.brandId ?? lookups.brandIds.get((row.brand as string).toLowerCase());
          break;
        case "categoryId":
          data.categoryId = categoryId;
          break;
        case "plu":
          data.plu = row.plu;
          break;
        case "barcode":
          data.barcode = row.barcode;
          break;
        case "description":
          data.description = row.description as string;
          break;
        case "origin":
          data.origin = row.origin;
          break;
        case "vatRate":
          data.vatRate = row.vatRate as number;
          break;
        default:
          data[c.field] = row.flags[c.field] as boolean;
      }
    }
    if ("basePrice" in data || "netContentAmount" in data)
      data.unitPricePencePerBaseUnit = deriveUnitPricePenceForSort(price, net);
    const fieldChanges = changesFor(target as Partial<Record<TrackedField, unknown>>, data);
    const extras = await db.$transaction(async (tx) => {
      if (Object.keys(data).length > 0)
        await tx.product.update({ where: { id: target.id, vendorId }, data });
      return writeExtras(tx, vendorId, target.id, target.slug, row, ctx.attributeIds);
    });
    const parts = [...changes.map((c) => `${c.field}: ${c.from || "—"} → ${c.to}`), ...extras];
    if (kept.length) parts.push(`kept ${kept.map((k) => `${k.field} (${k.reason})`).join(", ")}`);
    if (work.note) parts.push(`note: ${work.note}`);
    return {
      action: changes.length || extras.length ? "updated" : "unchanged",
      productId: target.id,
      name: row.displayName,
      detail: parts.join("; "),
      changes: fieldChanges,
    };
  }

  if (row.pricePence === null) throw new Error("no price on this row; a new product needs one");
  const id = crypto.randomUUID();
  const slug = uniqueSlug(ctx.slugs, row.displayName);
  const extras = await db.$transaction(async (tx) => {
    await tx.product.create({
      data: {
        id,
        vendorId,
        slug,
        name: row.displayName,
        description: row.description ?? "",
        categoryId,
        basePrice: row.pricePence as number,
        originalPrice: row.wasPricePence,
        unitLabel: unitLabelFor(row.pricePence as number),
        netContentAmount: row.netContent?.amount ?? null,
        netContentUnit: row.netContent?.unit ?? null,
        unitPricePencePerBaseUnit: deriveUnitPricePenceForSort(
          row.pricePence as number,
          row.netContent,
        ),
        isActive: false,
        brandId:
          targets.brandId ??
          (row.brand ? lookups.brandIds.get(row.brand.toLowerCase()) : null) ??
          null,
        plu: row.plu,
        barcode: row.barcode,
        origin: row.origin,
        ...(row.vatRate !== null ? { vatRate: row.vatRate } : {}),
        ...row.flags,
        importBatchId: ctx.batchId,
        importSourceRow: row.rowNumber,
      },
    });
    await tx.inventory.create({
      data: {
        vendorId,
        productId: id,
        quantity: 0,
        stockMode: "UNKNOWN",
        // #1572 — the store-wide low-stock default.
        lowStockThreshold: await readLowStockDefault(tx, vendorId),
      },
    });
    return writeExtras(tx, vendorId, id, slug, row, ctx.attributeIds);
  });
  return {
    action: "created",
    productId: id,
    name: row.displayName,
    detail: [
      `hidden, ${pounds(row.pricePence)}`,
      ...extras,
      ...(work.note ? [`note: ${work.note}`] : []),
    ].join("; "),
    changes: [],
  };
}

/** Filters and offers (#1570 R9, R12). Existing values are kept; everything new is inactive. */
export async function writeExtras(
  tx: Tx,
  vendorId: string,
  productId: string,
  slug: string,
  row: NormalisedRow,
  attributeIds: AttributeIds,
): Promise<string[]> {
  const notes: string[] = [];
  for (const [name, option] of Object.entries(row.attributes)) {
    const attr = attributeIds.get(name);
    if (!attr) continue;
    const optionId = attr.options.get(slugify(option)) as string;
    const existing = await tx.productAttributeValue.findUnique({
      where: { productId_attributeId: { productId, attributeId: attr.id } },
      select: { optionId: true },
    });
    if (!existing) {
      await tx.productAttributeValue.create({
        data: { vendorId, productId, attributeId: attr.id, optionId },
      });
      notes.push(`${name}: ${option}`);
    } else if (existing.optionId !== optionId) {
      notes.push(`kept existing ${name}`);
    }
  }
  if (row.multiBuy) {
    const tier = await tx.productPriceTier.findUnique({
      where: { productId },
      select: { id: true },
    });
    if (!tier) {
      await tx.productPriceTier.create({
        data: {
          vendorId,
          productId,
          groupQuantity: row.multiBuy.quantity,
          groupPricePence: row.multiBuy.pricePence,
          isActive: false,
        },
      });
      notes.push(
        `multi-buy ${row.multiBuy.quantity} for ${pounds(row.multiBuy.pricePence)} (inactive)`,
      );
    }
  }
  if (row.bundle) {
    const bundleSlug = slugify(row.bundle.name);
    let bundle = await tx.bundle.findUnique({
      where: { vendorId_slug: { vendorId, slug: bundleSlug } },
      select: { id: true },
    });
    if (!bundle) {
      bundle = await tx.bundle.create({
        data: { vendorId, slug: bundleSlug, name: row.bundle.name, isActive: false },
        select: { id: true },
      });
      notes.push(`bundle ${row.bundle.name} created (inactive)`);
    }
    const item = await tx.bundleItem.findUnique({
      where: { bundleId_productId: { bundleId: bundle.id, productId } },
      select: { id: true },
    });
    if (!item) {
      await tx.bundleItem.create({
        data: { bundleId: bundle.id, productId, quantity: row.bundle.quantity },
      });
      notes.push(`in bundle ${row.bundle.name} ×${row.bundle.quantity}`);
    }
  }
  if (row.promotion) {
    const promo = await tx.promotion.findFirst({
      where: { vendorId, productId, headline: row.promotion },
      select: { id: true },
    });
    if (!promo) {
      await tx.promotion.create({
        data: {
          vendorId,
          productId,
          headline: row.promotion,
          linkUrl: `/products/${slug}`,
          isActive: false,
        },
      });
      notes.push(`promotion "${row.promotion}" (inactive)`);
    }
  }
  return notes;
}

// ---- Settings -----------------------------------------------------------------------------

export interface StoredSettings {
  data: ImportSettingsData;
  version: Date;
}

export async function readImportSettings(
  db: Db | DbWs,
  vendorId: string,
): Promise<StoredSettings | null> {
  const s = await db.stockImportSettings.findUnique({
    where: { vendorId },
    include: { presets: true, defaultCategory: { select: { slug: true } } },
  });
  if (!s) return null;
  const [aliases, spellings, groups, words, texts, files, brands] = await Promise.all([
    db.stockImportBrandAlias.findMany({
      where: { vendorId },
      select: { brandId: true, alias: true },
    }),
    db.stockImportSpelling.findMany({ where: { vendorId }, orderBy: { wrong: "asc" } }),
    db.stockImportSynonymGroup.findMany({
      where: { vendorId },
      orderBy: { sortOrder: "asc" },
      include: { words: { orderBy: { id: "asc" } } },
    }),
    db.stockImportWord.findMany({ where: { vendorId }, orderBy: { word: "asc" } }),
    db.stockImportCategoryText.findMany({
      where: { vendorId },
      include: { category: { select: { slug: true } } },
      orderBy: { text: "asc" },
    }),
    db.stockImportFileRule.findMany({
      where: { vendorId },
      orderBy: { sortOrder: "asc" },
      include: { brand: { select: { name: true } }, category: { select: { slug: true } } },
    }),
    db.brand.findMany({ where: { vendorId }, select: { id: true, name: true } }),
  ]);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const byBrand = new Map<string, string[]>();
  for (const a of aliases) byBrand.set(a.brandId, [...(byBrand.get(a.brandId) ?? []), a.alias]);
  const wordsOf = (kind: "IGNORE" | "NOISE" | "PRESERVE") =>
    words.filter((w) => w.kind === kind).map((w) => w.word);
  const textsOf = (kind: "SECTION" | "COLUMN") =>
    Object.fromEntries(texts.filter((t) => t.kind === kind).map((t) => [t.text, t.category.slug]));
  const columns: ImportSettingsData["columns"] = { name: s.nameColumn };
  const optional = {
    size: s.sizeColumn,
    price: s.priceColumn,
    plu: s.pluColumn,
    barcode: s.barcodeColumn,
    brand: s.brandColumn,
    category: s.categoryColumn,
    description: s.descriptionColumn,
    wasPrice: s.wasPriceColumn,
    multiBuy: s.multiBuyColumn,
    bundle: s.bundleColumn,
    bundleQuantity: s.bundleQuantityColumn,
    promotion: s.promotionColumn,
    vat: s.vatColumn,
    origin: s.originColumn,
  };
  for (const [k, v] of Object.entries(optional)) if (v) columns[k as keyof typeof optional] = v;
  return {
    version: s.updatedAt,
    data: {
      headerRow: s.headerRow,
      columns,
      defaultCategorySlug: s.defaultCategory.slug,
      presets: s.presets
        .map((p) => p.preset.toLowerCase())
        .filter(isPresetName)
        .sort(
          (a, b) =>
            ["general", "spices", "rice", "fish"].indexOf(a) -
            ["general", "spices", "rice", "fish"].indexOf(b),
        ),
      nameTemplate: s.nameTemplate,
      keepTillWords: s.keepTillWords,
      renameMatched: s.renameMatched,
      moveMatchedToCategory: s.moveMatchedToCategory,
      notes: s.notes,
      brandAliases: [...byBrand.entries()]
        .filter(([id]) => brandName.has(id))
        .map(([id, list]) => ({ brand: brandName.get(id) as string, aliases: list.sort() }))
        .sort((a, b) => a.brand.localeCompare(b.brand)),
      spelling: Object.fromEntries(spellings.map((r) => [r.wrong, r.replacement])),
      synonyms: groups.map((g) => g.words.map((w) => w.word)).filter((g) => g.length >= 2),
      ignoreWords: wordsOf("IGNORE"),
      noiseWords: wordsOf("NOISE"),
      preserveWords: wordsOf("PRESERVE"),
      sectionCategories: textsOf("SECTION"),
      categoryMap: textsOf("COLUMN"),
      files: files.map((f) => ({
        match: f.pattern,
        ...(f.brand ? { brand: f.brand.name } : {}),
        ...(f.category ? { category: f.category.slug } : {}),
      })),
    },
  };
}

export type SaveSettingsResult = { ok: true; version: Date } | { ok: false; error: string };

/**
 * Replace a store's import settings. Brands and categories are named (brand name, category slug)
 * and must exist; the result names any that do not.
 */
export async function saveImportSettings(
  db: DbWs,
  vendorId: string,
  data: ImportSettingsData,
): Promise<SaveSettingsResult> {
  const [brands, categories] = await Promise.all([
    db.brand.findMany({ where: { vendorId }, select: { id: true, name: true, slug: true } }),
    db.category.findMany({ where: { vendorId }, select: { id: true, slug: true } }),
  ]);
  const brandId = (name: string) =>
    brands.find((b) => b.name.toLowerCase() === name.toLowerCase() || b.slug === slugify(name))?.id;
  const categoryId = (slug: string) => categories.find((c) => c.slug === slug)?.id;
  const missingBrands = [
    ...data.brandAliases.map((b) => b.brand),
    ...data.files.flatMap((f) => (f.brand ? [f.brand] : [])),
  ].filter((n) => !brandId(n));
  const missingCategories = [
    data.defaultCategorySlug,
    ...Object.values(data.sectionCategories),
    ...Object.values(data.categoryMap),
    ...data.files.flatMap((f) => (f.category ? [f.category] : [])),
  ].filter((s) => !categoryId(s));
  if (missingBrands.length)
    return {
      ok: false,
      error: `These brands do not exist yet (add them under Brands first): ${[...new Set(missingBrands)].join(", ")}`,
    };
  if (missingCategories.length)
    return {
      ok: false,
      error: `These categories do not exist: ${[...new Set(missingCategories)].join(", ")}`,
    };
  const aliasSeen = new Set<string>();
  const aliasRows = data.brandAliases.flatMap((b) =>
    b.aliases
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a && !aliasSeen.has(a) && aliasSeen.add(a))
      .map((alias) => ({ vendorId, brandId: brandId(b.brand) as string, alias })),
  );
  const columns = {
    nameColumn: data.columns.name,
    sizeColumn: data.columns.size ?? null,
    priceColumn: data.columns.price ?? null,
    pluColumn: data.columns.plu ?? null,
    barcodeColumn: data.columns.barcode ?? null,
    brandColumn: data.columns.brand ?? null,
    categoryColumn: data.columns.category ?? null,
    descriptionColumn: data.columns.description ?? null,
    wasPriceColumn: data.columns.wasPrice ?? null,
    multiBuyColumn: data.columns.multiBuy ?? null,
    bundleColumn: data.columns.bundle ?? null,
    bundleQuantityColumn: data.columns.bundleQuantity ?? null,
    promotionColumn: data.columns.promotion ?? null,
    vatColumn: data.columns.vat ?? null,
    originColumn: data.columns.origin ?? null,
  };
  const fields = {
    headerRow: data.headerRow,
    ...columns,
    defaultCategoryId: categoryId(data.defaultCategorySlug) as string,
    nameTemplate: data.nameTemplate,
    keepTillWords: data.keepTillWords,
    renameMatched: data.renameMatched,
    moveMatchedToCategory: data.moveMatchedToCategory,
    notes: data.notes,
  };
  const saved = await db.$transaction(async (tx) => {
    const settings = await tx.stockImportSettings.upsert({
      where: { vendorId },
      create: { vendorId, ...fields },
      update: fields,
      select: { id: true, updatedAt: true },
    });
    await tx.stockImportSettingsPreset.deleteMany({ where: { settingsId: settings.id } });
    if (data.presets.length)
      await tx.stockImportSettingsPreset.createMany({
        data: [...new Set(data.presets)].map((p) => ({
          settingsId: settings.id,
          preset: p.toUpperCase() as Uppercase<PresetName>,
        })),
      });
    await tx.stockImportBrandAlias.deleteMany({ where: { vendorId } });
    if (aliasRows.length) await tx.stockImportBrandAlias.createMany({ data: aliasRows });
    await tx.stockImportSpelling.deleteMany({ where: { vendorId } });
    const spelling = Object.entries(data.spelling);
    if (spelling.length)
      await tx.stockImportSpelling.createMany({
        data: spelling.map(([wrong, replacement]) => ({ vendorId, wrong, replacement })),
      });
    await tx.stockImportSynonymGroup.deleteMany({ where: { vendorId } });
    for (const [sortOrder, words] of data.synonyms.entries()) {
      const group = await tx.stockImportSynonymGroup.create({
        data: { vendorId, sortOrder },
        select: { id: true },
      });
      await tx.stockImportSynonymWord.createMany({
        data: [...new Set(words)].map((word) => ({ groupId: group.id, word })),
      });
    }
    await tx.stockImportWord.deleteMany({ where: { vendorId } });
    const wordRows = [
      ...data.ignoreWords.map((word) => ({ vendorId, kind: "IGNORE" as const, word })),
      ...data.noiseWords.map((word) => ({ vendorId, kind: "NOISE" as const, word })),
      ...data.preserveWords.map((word) => ({ vendorId, kind: "PRESERVE" as const, word })),
    ];
    if (wordRows.length)
      await tx.stockImportWord.createMany({ data: wordRows, skipDuplicates: true });
    await tx.stockImportCategoryText.deleteMany({ where: { vendorId } });
    const textRows = [
      ...Object.entries(data.sectionCategories).map(([text, slug]) => ({
        vendorId,
        kind: "SECTION" as const,
        text,
        categoryId: categoryId(slug) as string,
      })),
      ...Object.entries(data.categoryMap).map(([text, slug]) => ({
        vendorId,
        kind: "COLUMN" as const,
        text,
        categoryId: categoryId(slug) as string,
      })),
    ];
    if (textRows.length) await tx.stockImportCategoryText.createMany({ data: textRows });
    await tx.stockImportFileRule.deleteMany({ where: { vendorId } });
    if (data.files.length)
      await tx.stockImportFileRule.createMany({
        data: data.files.map((f, sortOrder) => ({
          vendorId,
          pattern: f.match,
          brandId: f.brand ? (brandId(f.brand) ?? null) : null,
          categoryId: f.category ? (categoryId(f.category) ?? null) : null,
          sortOrder,
        })),
      });
    return settings;
  });
  return { ok: true, version: saved.updatedAt };
}

// ---- Runs ---------------------------------------------------------------------------------

export type RunResult = { ok: true; runId: string } | { ok: false; error: string };

async function planGrid(
  db: Db | DbWs,
  vendorId: string,
  settings: StoredSettings,
  fileName: string,
  grid: string[][],
) {
  const store = await loadImportStore(db, vendorId);
  const profile = profileFromSettings(settings.data, store.vendorSlug);
  const knownBrands = store.brands.map((b) => b.name);
  const normalised = normaliseFile({ fileName, grid, firstRowNumber: 1 }, profile, knownBrands);
  const lookups = buildLookups(profile, store.brands, store.categories);
  const tillNames = await readTillNames(db, vendorId);
  const lines = buildPlan(
    normalised.rows,
    store.catalogue,
    profile,
    knownBrands,
    lookups,
    NO_OVERWRITE,
    tillNames,
  );
  return {
    lines: lines.map((l, i) => plannedLineData(l, i, lookups)),
    fileIssues: normalised.fileIssues.map((i) => i.message),
  };
}

/**
 * Plan an uploaded grid against the store's catalogue and save it as a run (R3). Writes nothing to
 * products. `decisions` (CLI `to-screen`) pre-sets lines by key.
 */
export async function createImportRun(
  db: DbWs,
  vendorId: string,
  input: {
    fileName: string;
    fileSha256: string;
    grid: string[][];
    userId: string | null;
    decisions?: ReadonlyMap<string, { decision: "HOLD" | "SKIP"; question: string }>;
  },
): Promise<RunResult> {
  const settings = await readImportSettings(db, vendorId);
  if (!settings) return { ok: false, error: "Set up the import settings first." };
  const dataRows = input.grid.filter((r) => r.some((c) => String(c ?? "").trim() !== "")).length;
  if (dataRows === 0) return { ok: false, error: "The file has no rows." };
  if (dataRows > MAX_IMPORT_ROWS)
    return {
      ok: false,
      error: `The file has ${dataRows.toLocaleString("en-GB")} rows; the limit is ${MAX_IMPORT_ROWS.toLocaleString("en-GB")}. Split it into smaller files.`,
    };
  const plan = await planGrid(db, vendorId, settings, input.fileName, input.grid);
  if (plan.lines.length === 0)
    return {
      ok: false,
      error:
        `No product rows were found. ${plan.fileIssues.join(" ")} Check the column settings.`.trim(),
    };
  const runId = crypto.randomUUID();
  const cells = gridToCells(input.grid);
  await db.$transaction(
    async (tx) => {
      await tx.stockImportRun.create({
        data: {
          id: runId,
          vendorId,
          fileName: input.fileName,
          fileSha256: input.fileSha256,
          rowCount: input.grid.length,
          batchId: `stock-import-${runId.slice(0, 8)}`,
          settingsVersion: settings.version,
          createdByUserId: input.userId,
        },
      });
      for (let i = 0; i < cells.length; i += 1000)
        await tx.stockImportCell.createMany({
          data: cells.slice(i, i + 1000).map((c) => ({ runId, ...c })),
        });
      const rows = plan.lines.map((l) => {
        const preset = input.decisions?.get(l.key);
        return {
          ...l,
          runId,
          vendorId,
          decision: preset ? preset.decision : l.suggestion,
          question: preset?.decision === "HOLD" ? preset.question : "",
          note: preset?.decision === "SKIP" ? preset.question : "",
        };
      });
      for (let i = 0; i < rows.length; i += 500)
        await tx.stockImportLine.createMany({ data: rows.slice(i, i + 500) });
    },
    { timeout: 30_000 },
  );
  return { ok: true, runId };
}

async function readGrid(db: Db | DbWs, runId: string, rowCount: number): Promise<string[][]> {
  const cells = await db.stockImportCell.findMany({
    where: { runId },
    select: { rowIndex: true, columnIndex: true, value: true },
  });
  return cellsToGrid(cells, rowCount);
}

/**
 * R7 — plan the stored rows again with the current settings and catalogue. Applied lines are left
 * alone; a decision someone made is kept by row; other lines take the new suggestion.
 */
export async function replanImportRun(
  db: DbWs,
  vendorId: string,
  runId: string,
): Promise<RunResult> {
  const run = await db.stockImportRun.findFirst({ where: { id: runId, vendorId, status: "OPEN" } });
  if (!run) return { ok: false, error: "That import is not open." };
  const settings = await readImportSettings(db, vendorId);
  if (!settings) return { ok: false, error: "Set up the import settings first." };
  const grid = await readGrid(db, runId, run.rowCount);
  const plan = await planGrid(db, vendorId, settings, run.fileName, grid);
  const existing = await db.stockImportLine.findMany({
    where: { runId },
    select: { id: true, key: true, status: true, decidedAt: true, decision: true },
  });
  const byKey = new Map(existing.map((l) => [l.key, l]));
  const keys = new Set(plan.lines.map((l) => l.key));
  await db.$transaction(
    async (tx) => {
      for (const l of plan.lines) {
        const old = byKey.get(l.key);
        if (!old) {
          await tx.stockImportLine.create({
            data: { ...l, runId, vendorId, decision: l.suggestion },
          });
        } else if (old.status !== "APPLIED" && old.status !== "UNDONE") {
          await tx.stockImportLine.update({
            where: { id: old.id },
            data: {
              ...l,
              decision: old.decidedAt || old.decision === "HOLD" ? old.decision : l.suggestion,
              status: old.status === "APPLYING" ? "APPLYING" : "OPEN",
            },
          });
        }
      }
      const gone = existing
        .filter((l) => !keys.has(l.key) && (l.status === "OPEN" || l.status === "FAILED"))
        .map((l) => l.id);
      if (gone.length) await tx.stockImportLine.deleteMany({ where: { id: { in: gone } } });
      await tx.stockImportRun.update({
        where: { id: runId },
        data: { settingsVersion: settings.version },
      });
    },
    { timeout: 30_000 },
  );
  return { ok: true, runId };
}

const PRODUCT_SUMMARY = {
  select: {
    id: true,
    name: true,
    plu: true,
    basePrice: true,
    netContentAmount: true,
    netContentUnit: true,
    isActive: true,
    brand: { select: { name: true } },
  },
} as const;

export async function getImportRun(db: Db | DbWs, vendorId: string, runId: string) {
  const run = await db.stockImportRun.findFirst({
    where: { id: runId, vendorId },
    include: {
      createdBy: { select: { name: true } },
      lines: {
        orderBy: { position: "asc" },
        include: {
          targetProduct: PRODUCT_SUMMARY,
          runnerUpProduct: PRODUCT_SUMMARY,
          resultProduct: PRODUCT_SUMMARY,
          decidedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!run) return null;
  const settings = await db.stockImportSettings.findUnique({
    where: { vendorId },
    select: { updatedAt: true },
  });
  return {
    ...run,
    settingsChanged: !!settings && settings.updatedAt.getTime() !== run.settingsVersion.getTime(),
  };
}

export type ImportRunDetail = NonNullable<Awaited<ReturnType<typeof getImportRun>>>;

export async function listImportRuns(db: Db | DbWs, vendorId: string, take = 20) {
  const runs = await db.stockImportRun.findMany({
    where: { vendorId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      fileName: true,
      status: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      lines: { select: { decision: true, status: true, result: true } },
    },
  });
  return runs.map(({ lines, ...run }) => ({
    ...run,
    lineCount: lines.length,
    needsDecision: lines.filter(
      (l) => l.status !== "APPLIED" && (l.decision === "REVIEW" || l.decision === "HOLD"),
    ).length,
    readyToApply: lines.filter(
      (l) =>
        (l.status === "OPEN" || l.status === "FAILED") &&
        (l.decision === "UPDATE" || l.decision === "CREATE"),
    ).length,
    applied: lines.filter((l) => l.status === "APPLIED").length,
  }));
}

export type DecideInput = {
  decision: "UPDATE" | "CREATE" | "SKIP" | "HOLD";
  targetProductId: string | null;
  note: string;
};

export type DecideResult = { ok: true } | { ok: false; error: string };

/** R4 — a reviewer's decision on one line that has not been applied. */
export async function decideImportLine(
  db: Db | DbWs,
  vendorId: string,
  lineId: string,
  userId: string | null,
  input: DecideInput,
): Promise<DecideResult> {
  const line = await db.stockImportLine.findFirst({
    where: { id: lineId, vendorId, run: { status: "OPEN" } },
    select: { status: true, question: true },
  });
  if (!line) return { ok: false, error: "That line is not part of an open import." };
  if (line.status === "APPLIED" || line.status === "APPLYING" || line.status === "UNDONE")
    return { ok: false, error: "That line has already been applied." };
  let target: string | null = null;
  if (input.decision === "UPDATE") {
    if (!input.targetProductId) return { ok: false, error: "Choose the product to update." };
    const product = await db.product.findFirst({
      where: { id: input.targetProductId, vendorId },
      select: { id: true },
    });
    if (!product) return { ok: false, error: "That product is not in this store." };
    target = product.id;
  }
  await db.stockImportLine.update({
    where: { id: lineId },
    data: {
      decision: input.decision,
      targetProductId: input.decision === "UPDATE" ? target : undefined,
      note: input.note.slice(0, 500),
      decidedByUserId: userId,
      decidedAt: new Date(),
      status: "OPEN",
    },
  });
  return { ok: true };
}

export async function searchImportProducts(db: Db | DbWs, vendorId: string, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  return db.product.findMany({
    where: {
      vendorId,
      OR: [{ name: { contains: q, mode: "insensitive" } }, { plu: q }, { barcode: q }],
    },
    orderBy: { name: "asc" },
    take: 20,
    ...PRODUCT_SUMMARY,
  });
}

export type ImportProductSummary = Awaited<ReturnType<typeof searchImportProducts>>[number];

export type ApplyChunkResult =
  | {
      ok: true;
      applied: number;
      failed: number;
      remaining: number;
      masterCreated: string[];
    }
  | { ok: false; error: string };

/**
 * R5 — apply the next chunk of decided lines. Each line is claimed first (OPEN/FAILED → APPLYING),
 * so two tabs never write a line twice, then written in its own transaction. The browser calls
 * this until `remaining` is 0.
 */
export async function applyImportChunk(
  db: DbWs,
  vendorId: string,
  runId: string,
  limit = APPLY_CHUNK,
): Promise<ApplyChunkResult> {
  const run = await db.stockImportRun.findFirst({ where: { id: runId, vendorId, status: "OPEN" } });
  if (!run) return { ok: false, error: "That import is not open." };
  const settings = await readImportSettings(db, vendorId);
  if (!settings) return { ok: false, error: "Set up the import settings first." };
  if (settings.version.getTime() !== run.settingsVersion.getTime())
    return {
      ok: false,
      error:
        "The import settings changed after this file was checked. Refresh the plan, then apply.",
    };

  // FAILED lines are not retaken here (the browser would loop on a line that always fails);
  // `reopenFailedLines` puts them back before an apply the reviewer starts.
  const applicable = (now: Date): Prisma.StockImportLineWhereInput => ({
    runId,
    decision: { in: ["UPDATE", "CREATE"] },
    OR: [
      { status: "OPEN" },
      { status: "APPLYING", claimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
    ],
  });
  const now = new Date();
  const candidates = await db.stockImportLine.findMany({
    where: applicable(now),
    orderBy: { position: "asc" },
    take: limit,
    select: { id: true },
  });
  const claimed: string[] = [];
  for (const c of candidates) {
    const got = await db.stockImportLine.updateMany({
      where: { id: c.id, ...applicable(now) },
      data: { status: "APPLYING", claimedAt: now },
    });
    if (got.count === 1) claimed.push(c.id);
  }
  if (claimed.length === 0) {
    const remaining = await db.stockImportLine.count({ where: applicable(new Date()) });
    return { ok: true, applied: 0, failed: 0, remaining, masterCreated: [] };
  }
  const lines = await db.stockImportLine.findMany({
    where: { id: { in: claimed } },
    orderBy: { position: "asc" },
  });

  const store = await loadImportStore(db, vendorId);
  const profile = profileFromSettings(settings.data, store.vendorSlug);
  const knownBrands = store.brands.map((b) => b.name);
  const grid = await readGrid(db, runId, run.rowCount);
  const rows = new Map(
    normaliseFile(
      { fileName: run.fileName, grid, firstRowNumber: 1 },
      profile,
      knownBrands,
    ).rows.map((r) => [r.key, r]),
  );
  const lookups = buildLookups(profile, store.brands, store.categories);
  const byId = new Map(store.catalogue.map((p) => [p.id, p]));
  const byName = new Map(store.catalogue.map((p) => [p.name, p]));

  const work: { lineId: string; item: LineWork | null; error?: string }[] = lines.map((line) => {
    const row = rows.get(line.key);
    if (!row)
      return { lineId: line.id, item: null, error: "row not found in the file; refresh the plan" };
    if (line.decision === "UPDATE") {
      const target = line.targetProductId ? byId.get(line.targetProductId) : undefined;
      if (!target)
        return { lineId: line.id, item: null, error: "the product to update no longer exists" };
      return { lineId: line.id, item: { row, decision: "UPDATE", target, note: line.note } };
    }
    // R6 — a CREATE whose product now exists by that exact name updates it instead.
    const existing = byName.get(row.displayName);
    return {
      lineId: line.id,
      item: existing
        ? { row, decision: "UPDATE", target: existing, note: line.note }
        : { row, decision: "CREATE", target: null, note: line.note },
    };
  });

  let masterCreated: string[] = [];
  let attributeIds: AttributeIds = new Map();
  try {
    const master = await ensureMasterData(
      db,
      vendorId,
      work.flatMap((w) => (w.item ? [w.item.row] : [])),
      lookups,
    );
    masterCreated = master.created;
    attributeIds = master.attributeIds;
  } catch (e) {
    await db.stockImportLine.updateMany({
      where: { id: { in: claimed } },
      data: { status: "FAILED", resultDetail: e instanceof Error ? e.message : String(e) },
    });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const ctx: ApplyContext = {
    batchId: run.batchId,
    profile,
    knownBrands,
    lookups,
    attributeIds,
    options: NO_OVERWRITE,
    tillNames: await readTillNames(db, vendorId),
    slugs: new Set(store.catalogue.map((p) => p.slug)),
  };

  let applied = 0;
  let failed = 0;
  for (const w of work) {
    if (!w.item) {
      failed++;
      await db.stockImportLine.update({
        where: { id: w.lineId },
        data: { status: "FAILED", resultDetail: w.error ?? "failed" },
      });
      continue;
    }
    try {
      const outcome = await applyLine(db, vendorId, ctx, w.item);
      await db.stockImportLine.update({
        where: { id: w.lineId },
        data: {
          status: "APPLIED",
          result:
            outcome.action === "created"
              ? "CREATED"
              : outcome.action === "updated"
                ? "UPDATED"
                : "UNCHANGED",
          resultProductId: outcome.productId,
          resultDetail: outcome.detail,
          appliedAt: new Date(),
        },
      });
      if (outcome.changes.length)
        await db.stockImportFieldChange.createMany({
          data: outcome.changes.map((c) => ({
            lineId: w.lineId,
            productId: outcome.productId,
            ...c,
          })),
        });
      if (outcome.action === "created")
        byName.set(outcome.name, { id: outcome.productId, name: outcome.name } as ImportProduct);
      applied++;
    } catch (e) {
      failed++;
      await db.stockImportLine.update({
        where: { id: w.lineId },
        data: {
          status: "FAILED",
          resultDetail: e instanceof Error ? e.message.split("\n").slice(-1)[0] : String(e),
        },
      });
    }
  }
  const remaining = await db.stockImportLine.count({ where: applicable(new Date()) });
  return { ok: true, applied, failed, remaining, masterCreated };
}

/** Put a run's failed lines back in the queue, so the reviewer's next apply retries them once. */
export async function reopenFailedLines(
  db: DbWs,
  vendorId: string,
  runId: string,
): Promise<number> {
  const reopened = await db.stockImportLine.updateMany({
    where: { runId, vendorId, status: "FAILED", run: { status: "OPEN" } },
    data: { status: "OPEN" },
  });
  return reopened.count;
}

export interface UndoResult {
  deleted: number;
  restoredProducts: number;
  kept: { name: string; reason: string }[];
}

/**
 * R8 — undo a run: delete the products it created that nobody has touched since, and put back each
 * field it changed that still holds its value. Everything kept is listed with the reason.
 */
export async function undoImportRun(
  db: DbWs,
  vendorId: string,
  runId: string,
): Promise<{ ok: true; result: UndoResult } | { ok: false; error: string }> {
  const run = await db.stockImportRun.findFirst({ where: { id: runId, vendorId, status: "OPEN" } });
  if (!run) return { ok: false, error: "That import is not open, so it cannot be undone." };
  const applying = await db.stockImportLine.count({ where: { runId, status: "APPLYING" } });
  if (applying > 0)
    return { ok: false, error: "An apply is still running. Try again when it finishes." };
  const lines = await db.stockImportLine.findMany({
    where: { runId, status: "APPLIED" },
    select: {
      id: true,
      result: true,
      cleanName: true,
      resultProductId: true,
      changes: { where: { restoredAt: null } },
    },
  });
  const result: UndoResult = { deleted: 0, restoredProducts: 0, kept: [] };

  for (const line of lines) {
    if (line.result === "CREATED" && line.resultProductId) {
      const p = await db.product.findFirst({
        where: { id: line.resultProductId, vendorId },
        select: {
          id: true,
          name: true,
          isActive: true,
          isManuallyEdited: true,
          importBatchId: true,
          inventory: { select: { id: true, stockMode: true, quantity: true } },
          _count: {
            select: {
              orderItems: true,
              reviews: true,
              favourites: true,
              cartItems: true,
              images: true,
              bundleItems: true,
            },
          },
        },
      });
      if (!p) {
        await db.stockImportLine.update({ where: { id: line.id }, data: { status: "UNDONE" } });
        continue;
      }
      const reason =
        p.importBatchId !== run.batchId
          ? "it is not from this import"
          : p.isActive
            ? "it is live"
            : p.isManuallyEdited
              ? "staff edited it"
              : p.inventory && (p.inventory.stockMode !== "UNKNOWN" || p.inventory.quantity > 0)
                ? "it has stock"
                : p._count.orderItems || p._count.cartItems
                  ? "it is in an order or basket"
                  : p._count.reviews || p._count.favourites
                    ? "customers reviewed or saved it"
                    : p._count.images
                      ? "it has images"
                      : p._count.bundleItems
                        ? "it is in a bundle"
                        : null;
      if (reason) {
        result.kept.push({ name: p.name, reason });
        continue;
      }
      await db.$transaction(async (tx) => {
        await tx.inventoryAuditLog.deleteMany({ where: { productId: p.id } });
        if (p.inventory) await tx.inventory.delete({ where: { id: p.inventory.id } });
        await tx.product.delete({ where: { id: p.id } });
        await tx.stockImportLine.update({ where: { id: line.id }, data: { status: "UNDONE" } });
      });
      result.deleted++;
      continue;
    }
    if (line.changes.length && line.resultProductId) {
      const current = await db.product.findFirst({
        where: { id: line.resultProductId, vendorId },
        select: Object.fromEntries(TRACKED_FIELDS.map((f) => [f, true])) as Record<
          TrackedField,
          true
        >,
      });
      if (!current) continue;
      const plan = planRestore(
        current as Partial<Record<TrackedField, unknown>>,
        line.changes.map((c) => ({
          field: c.field as TrackedField,
          previousValue: c.previousValue,
          newValue: c.newValue,
        })),
      );
      await db.$transaction(async (tx) => {
        if (plan.restored.length)
          await tx.product.update({
            where: { id: line.resultProductId as string },
            data: plan.data as Prisma.ProductUncheckedUpdateInput,
          });
        const restoredIds = line.changes
          .filter((c) => plan.restored.includes(c.field as TrackedField))
          .map((c) => c.id);
        if (restoredIds.length)
          await tx.stockImportFieldChange.updateMany({
            where: { id: { in: restoredIds } },
            data: { restoredAt: new Date() },
          });
        await tx.stockImportLine.update({ where: { id: line.id }, data: { status: "UNDONE" } });
      });
      if (plan.restored.length) result.restoredProducts++;
      if (plan.kept.length)
        result.kept.push({
          name: line.cleanName,
          reason: `changed since the import: ${plan.kept.join(", ")}`,
        });
      continue;
    }
    await db.stockImportLine.update({ where: { id: line.id }, data: { status: "UNDONE" } });
  }
  await db.stockImportRun.update({ where: { id: runId }, data: { status: "UNDONE" } });
  return { ok: true, result };
}
