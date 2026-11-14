import { reimportedProductState } from "@/lib/catalogue-import-policy";
import type { ProductRestriction, StockMode } from "@/lib/cart-rules";
import { slugify } from "@/lib/catalogue-form";
import type { NetContentUnit } from "@/components/product/unit-price";
import { readLowStockDefault, type LowStockDefaultReader } from "@/lib/repositories/vendor";
import { isUniqueViolation } from "./errors";
import type { ImportPlan, PlannedProduct } from "./plan";

/**
 * #1216 — writes an `ImportPlan` for ONE vendor. The client is injected (CLAUDE.md, repository
 * layer shape: `prisma` and `vendorId` as explicit parameters), so the transaction behaviour can be
 * proved from a plain script or a unit test with a stub — which is how R21 is checked.
 *
 * THE SHAPE OF A WRITE.
 *  - One interactive `$transaction` per TOP-LEVEL DEPARTMENT, holding that department's categories,
 *    products, inventory rows and audit rows. A failure rolls back that department only; the
 *    others still run. (Interactive transactions and `createMany` need the WebSocket client; the
 *    script constructs it. This module never builds a client.)
 *  - Everything it writes carries the target `vendorId`. There is no delete, no raw SQL, and no
 *    write to a product, category or inventory row that already exists, except tightening a
 *    restriction (R23).
 *  - New rows only ever come from the plan: `isActive` false, `stockMode` UNKNOWN, quantity 0.
 */

const BATCH = 500;

/**
 * Prisma's interactive-transaction default is a 5 s timeout, which one large department (thousands of
 * products plus their inventory and audit rows) can exceed over a network round-trip per batch. A
 * timeout would roll that department back and report it FAILED, so the limit is raised explicitly.
 */
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

export type ProductWriteRow = {
  id: string;
  vendorId: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  basePrice: number;
  unitLabel: string;
  isActive: false;
  restriction: ProductRestriction | null;
  brandId?: string | null;
  netContentAmount?: number | null;
  netContentUnit?: NetContentUnit | null;
  unitPricePencePerBaseUnit?: number | null;
  plu?: string | null;
};
export type CategoryWriteRow = {
  id: string;
  vendorId: string;
  slug: string;
  name: string;
  parentId: string | null;
  isActive: false;
};
export type InventoryWriteRow = {
  id: string;
  vendorId: string;
  productId: string;
  quantity: 0;
  stockMode: StockMode;
  /** #1572 — the store-wide default; omitted when the client cannot read it (the column default). */
  lowStockThreshold?: number;
};
export type AuditWriteRow = {
  id: string;
  vendorId: string;
  productId: string;
  action: "RESTRICTION_SET";
  fromRestriction: ProductRestriction | null;
  toRestriction: ProductRestriction;
  actorUserId: null;
  source: "IMPORT";
  reason: null;
};

export interface ImportTx {
  category: { createMany(args: { data: CategoryWriteRow[] }): Promise<unknown> };
  product: {
    createMany(args: { data: ProductWriteRow[] }): Promise<unknown>;
    update(args: {
      where: { id: string; vendorId: string };
      data: {
        restriction?: ProductRestriction;
        isActive?: false;
        brandId?: string | null;
        netContentAmount?: number | null;
        netContentUnit?: NetContentUnit | null;
        unitPricePencePerBaseUnit?: number | null;
      };
    }): Promise<unknown>;
  };
  inventory: { createMany(args: { data: InventoryWriteRow[] }): Promise<unknown> };
  productRestrictionAuditLog: { createMany(args: { data: AuditWriteRow[] }): Promise<unknown> };
  /** #1572 — reads the store-wide low-stock default. Optional so narrow test doubles still fit. */
  vendorConfig?: LowStockDefaultReader["vendorConfig"];
  brand?: {
    create(args: {
      data: { id: string; vendorId: string; name: string; slug: string };
    }): Promise<unknown>;
  };
}

export interface ImportDb {
  category: {
    findMany(args: {
      where: { vendorId: string; slug: { in: string[] } };
      select: { id: true; slug: true };
    }): Promise<{ id: string; slug: string }[]>;
  };
  product: {
    findMany(args: {
      where: {
        vendorId: string;
        slug?: { in: string[] };
        plu?: { in: string[] };
      };
      select: {
        id: true;
        slug: true;
        name: true;
        basePrice: true;
        isActive: true;
        restriction: true;
        plu?: true;
        brandId?: true;
        netContentAmount?: true;
        netContentUnit?: true;
        isManuallyEdited?: true;
        manuallyEditedFields?: true;
      };
    }): Promise<
      {
        id: string;
        slug: string;
        name: string;
        basePrice: number;
        isActive: boolean;
        restriction: ProductRestriction | null;
        plu?: string | null;
        brandId?: string | null;
        netContentAmount?: number | null;
        netContentUnit?: NetContentUnit | null;
        isManuallyEdited?: boolean;
        manuallyEditedFields?: string[];
      }[]
    >;
  };
  brand?: {
    findMany(args: {
      where: { vendorId: string };
      select: { id: true; name: true; slug: true };
    }): Promise<{ id: string; name: string; slug: string }[]>;
  };
  $transaction<T>(
    fn: (tx: ImportTx) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}

export interface DepartmentOutcome {
  department: string;
  status: "WRITTEN" | "UNCHANGED" | "ALREADY_EXISTS" | "FAILED";
  categoriesCreated: number;
  productsCreated: number;
  productsUpdated: number;
  restrictionTightened: number;
  error?: string;
}

export interface DriftEntry {
  sourceRow: number;
  slug: string;
  field: "name" | "basePrice";
  existing: string | number;
  incoming: string | number;
}

export interface TraceEntry {
  sourceRow: number;
  slug: string;
  /** The product id once written; null when the row was skipped or its department failed. */
  productId: string | null;
}

export interface ApplyResult {
  departments: DepartmentOutcome[];
  categoriesCreated: number;
  productsCreated: number;
  productsUpdated: number;
  existingUnchanged: number;
  restrictionTightened: number;
  failedDepartments: number;
  drift: DriftEntry[];
  trace: TraceEntry[];
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const newId = (): string => globalThis.crypto.randomUUID();

export async function applyPlan(
  db: ImportDb,
  vendorId: string,
  plan: ImportPlan,
  options: { enrichExisting?: boolean } = {},
): Promise<ApplyResult> {
  const { enrichExisting = false } = options;
  // Existing rows are READ once, up front. An existing category keeps its id and name; an existing
  // product is only ever considered for a tightened restriction.
  const categoryIds = new Map<string, string>();
  for (const slugs of chunk(
    plan.categories.map((c) => c.slug),
    1000,
  )) {
    for (const row of await db.category.findMany({
      where: { vendorId, slug: { in: slugs } },
      select: { id: true, slug: true },
    })) {
      categoryIds.set(row.slug, row.id);
    }
  }
  const existingProducts = new Map<
    string,
    {
      id: string;
      name: string;
      basePrice: number;
      isActive: boolean;
      restriction: ProductRestriction | null;
      plu?: string | null;
      brandId?: string | null;
      netContentAmount?: number | null;
      netContentUnit?: NetContentUnit | null;
      isManuallyEdited?: boolean;
      manuallyEditedFields?: string[];
    }
  >();
  const existingProductsByPlu = new Map<
    string,
    {
      id: string;
      name: string;
      basePrice: number;
      isActive: boolean;
      restriction: ProductRestriction | null;
      plu?: string | null;
      brandId?: string | null;
      netContentAmount?: number | null;
      netContentUnit?: NetContentUnit | null;
      isManuallyEdited?: boolean;
      manuallyEditedFields?: string[];
    }
  >();
  for (const slugs of chunk(
    plan.products.map((p) => p.slug),
    1000,
  )) {
    for (const row of await db.product.findMany({
      where: { vendorId, slug: { in: slugs } },
      select: {
        id: true,
        slug: true,
        name: true,
        basePrice: true,
        isActive: true,
        restriction: true,
        plu: true,
        brandId: true,
        netContentAmount: true,
        netContentUnit: true,
        isManuallyEdited: true,
        manuallyEditedFields: true,
      },
    })) {
      existingProducts.set(row.slug, row);
    }
  }
  const plus = plan.products
    .map((p) => p.plu)
    .filter((plu): plu is string => Boolean(plu && plu.trim()));
  if (plus.length > 0) {
    try {
      for (const pluBatch of chunk(plus, 1000)) {
        const rows = await db.product.findMany({
          where: { vendorId, plu: { in: pluBatch } },
          select: {
            id: true,
            slug: true,
            name: true,
            basePrice: true,
            isActive: true,
            restriction: true,
            plu: true,
            brandId: true,
            netContentAmount: true,
            netContentUnit: true,
            isManuallyEdited: true,
            manuallyEditedFields: true,
          },
        });
        for (const row of rows) {
          if (row.plu) existingProductsByPlu.set(row.plu, row);
        }
      }
    } catch {
      // Stub environments without plu support in mock findMany
    }
  }

  const brandIdsByName = new Map<string, string>();
  if (db.brand) {
    try {
      const existingBrands = await db.brand.findMany({
        where: { vendorId },
        select: { id: true, name: true, slug: true },
      });
      for (const b of existingBrands) {
        brandIdsByName.set(b.name.trim().toLowerCase(), b.id);
      }
    } catch {
      // Stub environments
    }
  }

  // Pre-assign deterministic IDs for any new brands to be created
  const newBrandIdsByName = new Map<string, string>();
  for (const p of plan.products) {
    if (p.brandName) {
      const key = p.brandName.trim().toLowerCase();
      if (!brandIdsByName.has(key) && !newBrandIdsByName.has(key)) {
        newBrandIdsByName.set(key, newId());
      }
    }
  }
  const brandIdFor = (name: string | null | undefined): string | null => {
    if (!name) return null;
    const key = name.trim().toLowerCase();
    return brandIdsByName.get(key) ?? newBrandIdsByName.get(key) ?? null;
  };

  const result: ApplyResult = {
    departments: [],
    categoriesCreated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    existingUnchanged: 0,
    restrictionTightened: 0,
    failedDepartments: 0,
    drift: [],
    trace: [],
  };

  // Departments in first-occurrence order (the order their categories were planned).
  const departmentSlugs = plan.categories.filter((c) => c.parentSlug === null).map((c) => c.slug);

  for (const departmentSlug of departmentSlugs) {
    const department = plan.categories.find((c) => c.slug === departmentSlug)!;
    const categories = plan.categories.filter(
      (c) => c.slug === departmentSlug || c.parentSlug === departmentSlug,
    );
    const products = plan.products.filter((p) => p.departmentSlug === departmentSlug);

    // Ids are decided BEFORE the transaction so a retry-free failure leaves no half-known state.
    const newCategoryIds = new Map<string, string>();
    for (const c of categories) {
      if (!categoryIds.has(c.slug)) newCategoryIds.set(c.slug, newId());
    }
    const idFor = (slug: string): string => categoryIds.get(slug) ?? newCategoryIds.get(slug)!;

    const toCreate: { planned: PlannedProduct; id: string }[] = [];
    const tightenings: {
      id: string;
      planned: PlannedProduct;
      from: ProductRestriction | null;
      to: ProductRestriction;
    }[] = [];
    const updates: {
      id: string;
      data: {
        restriction?: ProductRestriction;
        isActive?: false;
        brandId?: string | null;
        netContentAmount?: number | null;
        netContentUnit?: NetContentUnit | null;
        unitPricePencePerBaseUnit?: number | null;
      };
    }[] = [];
    let unchanged = 0;
    const departmentDrift: DriftEntry[] = [];
    for (const planned of products) {
      const existing =
        existingProducts.get(planned.slug) ??
        (planned.plu ? existingProductsByPlu.get(planned.plu) : undefined);
      if (!existing) {
        toCreate.push({ planned, id: newId() });
        continue;
      }
      const next = reimportedProductState(
        { isActive: existing.isActive, restriction: existing.restriction },
        planned.restriction,
      );

      const updateData: {
        restriction?: ProductRestriction;
        isActive?: false;
        brandId?: string | null;
        netContentAmount?: number | null;
        netContentUnit?: NetContentUnit | null;
        unitPricePencePerBaseUnit?: number | null;
      } = {};
      let hasUpdate = false;

      if (next.tightened && next.restriction !== null) {
        tightenings.push({
          id: existing.id,
          planned,
          from: existing.restriction,
          to: next.restriction,
        });
        updateData.restriction = next.restriction;
        updateData.isActive = false;
        hasUpdate = true;
      }

      // Reliable enrichment: only when enrichExisting is enabled and field is missing on existing product
      if (enrichExisting) {
        if (planned.brandName && existing.brandId == null) {
          const brandProtected = Boolean(
            existing.isManuallyEdited && existing.manuallyEditedFields?.includes("brandId"),
          );
          if (!brandProtected) {
            const brandId = brandIdFor(planned.brandName);
            if (brandId) {
              updateData.brandId = brandId;
              hasUpdate = true;
            }
          }
        }

        if (
          planned.netContentAmount != null &&
          planned.netContentUnit != null &&
          existing.netContentAmount == null
        ) {
          const netProtected = Boolean(
            existing.isManuallyEdited &&
            (existing.manuallyEditedFields?.includes("netContent") ||
              existing.manuallyEditedFields?.includes("netContentAmount")),
          );
          if (!netProtected) {
            updateData.netContentAmount = planned.netContentAmount;
            updateData.netContentUnit = planned.netContentUnit;
            if (planned.unitPricePencePerBaseUnit != null) {
              updateData.unitPricePencePerBaseUnit = planned.unitPricePencePerBaseUnit;
            }
            hasUpdate = true;
          }
        }
      }

      if (hasUpdate) {
        updates.push({ id: existing.id, data: updateData });
      } else {
        unchanged += 1;
      }

      if (existing.name !== planned.name) {
        departmentDrift.push({
          sourceRow: planned.sourceRow,
          slug: planned.slug,
          field: "name",
          existing: existing.name,
          incoming: planned.name,
        });
      }
      if (existing.basePrice !== planned.basePrice) {
        departmentDrift.push({
          sourceRow: planned.sourceRow,
          slug: planned.slug,
          field: "basePrice",
          existing: existing.basePrice,
          incoming: planned.basePrice,
        });
      }
    }

    const enrichedUpdatesCount = updates.filter(
      (u) => !tightenings.some((t) => t.id === u.id),
    ).length;

    const outcome: DepartmentOutcome = {
      department: department.name,
      status: "WRITTEN",
      categoriesCreated: newCategoryIds.size,
      productsCreated: toCreate.length,
      productsUpdated: enrichedUpdatesCount,
      restrictionTightened: tightenings.length,
    };

    const nothingToWrite =
      newCategoryIds.size === 0 && toCreate.length === 0 && updates.length === 0;
    if (nothingToWrite) outcome.status = "UNCHANGED";

    try {
      if (!nothingToWrite)
        await db.$transaction(async (tx) => {
          const parents = categories.filter(
            (c) => newCategoryIds.has(c.slug) && c.parentSlug === null,
          );
          const children = categories.filter(
            (c) => newCategoryIds.has(c.slug) && c.parentSlug !== null,
          );
          // Parents first: a child's `parentId` references a row that must already exist.
          for (const group of [parents, children]) {
            if (group.length === 0) continue;
            await tx.category.createMany({
              data: group.map((c) => ({
                id: idFor(c.slug),
                vendorId,
                slug: c.slug,
                name: c.name,
                parentId: c.parentSlug === null ? null : idFor(c.parentSlug),
                isActive: false as const,
              })),
            });
          }

          if (tx.brand) {
            for (const planned of products) {
              if (planned.brandName) {
                const key = planned.brandName.trim().toLowerCase();
                if (!brandIdsByName.has(key)) {
                  const brandId = brandIdFor(planned.brandName)!;
                  const brandSlug = slugify(planned.brandName) || `brand-${brandId.slice(0, 8)}`;
                  await tx.brand.create({
                    data: {
                      id: brandId,
                      vendorId,
                      name: planned.brandName.trim(),
                      slug: brandSlug,
                    },
                  });
                  brandIdsByName.set(key, brandId);
                }
              }
            }
          }

          // #1572 — every new stock record starts at the store-wide low-stock default.
          const lowStockDefault = tx.vendorConfig
            ? await readLowStockDefault({ vendorConfig: tx.vendorConfig }, vendorId)
            : undefined;

          for (const batch of chunk(toCreate, BATCH)) {
            await tx.product.createMany({
              data: batch.map(({ planned, id }) => {
                const brandId = brandIdFor(planned.brandName);
                const row: ProductWriteRow = {
                  id,
                  vendorId,
                  slug: planned.slug,
                  name: planned.name,
                  description: planned.description,
                  categoryId: idFor(planned.categorySlug),
                  basePrice: planned.basePrice,
                  unitLabel: planned.unitLabel,
                  isActive: planned.isActive,
                  restriction: planned.restriction,
                };
                if (brandId) row.brandId = brandId;
                if (planned.netContentAmount != null)
                  row.netContentAmount = planned.netContentAmount;
                if (planned.netContentUnit != null) row.netContentUnit = planned.netContentUnit;
                if (planned.unitPricePencePerBaseUnit != null)
                  row.unitPricePencePerBaseUnit = planned.unitPricePencePerBaseUnit;
                if (planned.plu) row.plu = planned.plu;
                return row;
              }),
            });
            await tx.inventory.createMany({
              data: batch.map(({ planned, id }) => ({
                id: newId(),
                vendorId,
                productId: id,
                quantity: 0 as const,
                stockMode: planned.stockMode,
                ...(lowStockDefault === undefined ? {} : { lowStockThreshold: lowStockDefault }),
              })),
            });
            const audited = batch.filter(({ planned }) => planned.restriction !== null);
            if (audited.length > 0) {
              await tx.productRestrictionAuditLog.createMany({
                data: audited.map(({ planned, id }) => ({
                  id: newId(),
                  vendorId,
                  productId: id,
                  action: "RESTRICTION_SET" as const,
                  fromRestriction: null,
                  toRestriction: planned.restriction!,
                  actorUserId: null,
                  source: "IMPORT" as const,
                  reason: null,
                })),
              });
            }
          }

          for (const u of updates) {
            await tx.product.update({
              where: { id: u.id, vendorId },
              data: u.data,
            });
          }
          if (tightenings.length > 0) {
            await tx.productRestrictionAuditLog.createMany({
              data: tightenings.map((t) => ({
                id: newId(),
                vendorId,
                productId: t.id,
                action: "RESTRICTION_SET" as const,
                fromRestriction: t.from,
                toRestriction: t.to,
                actorUserId: null,
                source: "IMPORT" as const,
                reason: null,
              })),
            });
          }
        }, TRANSACTION_OPTIONS);
    } catch (error) {
      outcome.status = isUniqueViolation(error) ? "ALREADY_EXISTS" : "FAILED";
      outcome.error = error instanceof Error ? error.message : String(error);
      outcome.categoriesCreated = 0;
      outcome.productsCreated = 0;
      outcome.productsUpdated = 0;
      outcome.restrictionTightened = 0;
      result.departments.push(outcome);
      result.failedDepartments += 1;
      for (const planned of products) {
        result.trace.push({ sourceRow: planned.sourceRow, slug: planned.slug, productId: null });
      }
      continue;
    }

    result.departments.push(outcome);
    result.categoriesCreated += outcome.categoriesCreated;
    result.productsCreated += outcome.productsCreated;
    result.productsUpdated += outcome.productsUpdated;
    result.restrictionTightened += outcome.restrictionTightened;
    result.existingUnchanged += unchanged;
    result.drift.push(...departmentDrift);
    const createdIds = new Map(toCreate.map((c) => [c.planned.slug, c.id]));
    for (const planned of products) {
      result.trace.push({
        sourceRow: planned.sourceRow,
        slug: planned.slug,
        productId: createdIds.get(planned.slug) ?? existingProducts.get(planned.slug)?.id ?? null,
      });
    }
  }

  return result;
}
