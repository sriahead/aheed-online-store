import type { getPrisma, getPrismaWs } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import type { CatalogueWriteResult } from "@/lib/repositories/products";
import { MAX_ATTRIBUTES_PER_VENDOR, MAX_OPTIONS_PER_ATTRIBUTE } from "@/lib/attribute-form";

/**
 * Vendor-defined product filters (#912): a vendor's filters ("Colour"), their values ("Black"),
 * and — read-only here — how many products use each. The per-product values are written by
 * `lib/repositories/products.ts`, inside the product's own create/update.
 *
 * Every export takes `prisma` and `vendorId` as EXPLICIT parameters and reads no request context
 * (#252), so a plain `tsx` script can exercise it; the request-scoped facade is
 * `lib/attributes-service.ts`. `tests/repository-purity.test.ts` and
 * `tests/repository-client-injection.test.ts` enforce both halves.
 *
 * WHY TWO CLIENT TYPES. The renames use `updateMany` (so the `vendorId` scope can sit in the
 * `where`), and `updateMany` crashes unconditionally over the HTTP adapter (#382) — so they take
 * `DbWs`. `create`, `deleteMany` and every read are fine on the ordinary client.
 *
 * VENDOR SCOPE. An option carries no `vendorId` of its own; it is scoped through its attribute
 * (`attribute: { vendorId }`), and every write that targets an existing row matches it by id AND
 * vendor, so another vendor's id behaves exactly like one that never existed.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;

export interface AttributeOptionRow {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  /** Products currently carrying this value — shown before a delete removes it from them. */
  productCount: number;
}

/** #918 — `LIST` picks from `options`; `NUMBER` holds a decimal per product and has no options. */
export type AttributeKind = "LIST" | "NUMBER";

export interface AttributeRow {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  kind: AttributeKind;
  /** A NUMBER filter's unit ("W"); always null for LIST. */
  unit: string | null;
  showOnCard: boolean;
  /** Products carrying ANY value of this filter (one value per product per filter, so rows = products). */
  productCount: number;
  options: AttributeOptionRow[];
}

/** The smallest shape the storefront and the product form need: no counts. */
export interface AttributeDefinition {
  id: string;
  name: string;
  slug: string;
  kind: AttributeKind;
  unit: string | null;
  /** Always empty for a NUMBER filter. */
  options: { id: string; name: string; slug: string }[];
}

const DUPLICATE_ATTRIBUTE = {
  ok: false as const,
  error: "This store already has a filter with that name.",
  field: "name",
};
const DUPLICATE_OPTION = {
  ok: false as const,
  error: "That filter already has that value.",
  field: "name",
};
const TOO_MANY_ATTRIBUTES = {
  ok: false as const,
  error: "A store can have at most 20 filters.",
  field: "name",
};
const TOO_MANY_OPTIONS = {
  ok: false as const,
  error: "A filter can have at most 50 values.",
  field: "name",
};
const ATTRIBUTE_NOT_FOUND = {
  ok: false as const,
  error: "That filter no longer exists.",
  field: "id",
};
const OPTION_NOT_FOUND = {
  ok: false as const,
  error: "That value no longer exists.",
  field: "id",
};
const NOT_CONFIRMED = {
  ok: false as const,
  error: "Tick the box to confirm.",
  field: "confirmDelete",
};
const NUMBER_HAS_NO_OPTIONS = {
  ok: false as const,
  error: "This filter takes a number, not a list of values.",
  field: "name",
};

const ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

/** Every filter for the vendor, each with its values and usage counts, for `/staff/attributes`. */
export async function listAttributesForVendor(
  prisma: Db,
  vendorId: string,
): Promise<AttributeRow[]> {
  const rows = await prisma.vendorAttribute.findMany({
    where: { vendorId },
    orderBy: ORDER,
    select: {
      id: true,
      name: true,
      slug: true,
      sortOrder: true,
      kind: true,
      unit: true,
      showOnCard: true,
      _count: { select: { productValues: true } },
      options: {
        orderBy: ORDER,
        select: {
          id: true,
          name: true,
          slug: true,
          sortOrder: true,
          _count: { select: { productValues: true } },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
    kind: row.kind,
    unit: row.unit,
    showOnCard: row.showOnCard,
    productCount: row._count.productValues,
    options: row.options.map((option) => ({
      id: option.id,
      name: option.name,
      slug: option.slug,
      sortOrder: option.sortOrder,
      productCount: option._count.productValues,
    })),
  }));
}

/**
 * Every filter with its values, no counts — what the storefront resolves `attr_*` params against
 * and what the staff product form renders a select for. One query.
 */
export async function listAttributeDefinitions(
  prisma: Db,
  vendorId: string,
): Promise<AttributeDefinition[]> {
  return prisma.vendorAttribute.findMany({
    where: { vendorId },
    orderBy: ORDER,
    select: {
      id: true,
      name: true,
      slug: true,
      kind: true,
      unit: true,
      options: { orderBy: ORDER, select: { id: true, name: true, slug: true } },
    },
  });
}

/**
 * Create a filter, appended after the vendor's existing ones. The cap is checked before the write;
 * two simultaneous creates could briefly exceed it by one, which is harmless — the cap exists to
 * bound the storefront facet panel, not as an integrity rule.
 *
 * `isUniqueViolation` accepts BOTH driver error codes (`P2002` and raw SQLSTATE `23505`).
 */
export async function createAttributeForVendor(
  prisma: Db,
  vendorId: string,
  input: { name: string; slug: string; kind: AttributeKind; unit: string | null },
): Promise<CatalogueWriteResult> {
  const existing = await prisma.vendorAttribute.count({ where: { vendorId } });
  if (existing >= MAX_ATTRIBUTES_PER_VENDOR) return TOO_MANY_ATTRIBUTES;
  try {
    const created = await prisma.vendorAttribute.create({
      // #918 — the ONLY write of `kind`; a LIST filter never carries a unit.
      data: {
        vendorId,
        name: input.name,
        slug: input.slug,
        sortOrder: existing,
        kind: input.kind,
        unit: input.kind === "NUMBER" ? input.unit : null,
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE_ATTRIBUTE;
    throw error;
  }
}

/**
 * Rename and reposition a filter, and set whether it shows on product cards (#918). The SLUG never
 * changes: shoppers' shared links carry it. Nor does the KIND — nothing but the create writes it.
 *
 * `unit` is written only for a NUMBER filter, so a LIST filter's unit stays null whatever was
 * submitted. That needs the kind, hence the read first; the write stays one `updateMany` scoped by
 * vendor, so another vendor's id still updates nothing.
 */
export async function renameAttributeForVendor(
  prismaWs: DbWs,
  vendorId: string,
  input: { id: string; name: string; sortOrder: number; showOnCard: boolean; unit: string | null },
): Promise<CatalogueWriteResult> {
  const existing = await prismaWs.vendorAttribute.findFirst({
    where: { id: input.id, vendorId },
    select: { kind: true },
  });
  if (!existing) return ATTRIBUTE_NOT_FOUND;
  const updated = await prismaWs.vendorAttribute.updateMany({
    where: { id: input.id, vendorId },
    data: {
      name: input.name,
      sortOrder: input.sortOrder,
      showOnCard: input.showOnCard,
      ...(existing.kind === "NUMBER" ? { unit: input.unit } : {}),
    },
  });
  if (updated.count === 0) return ATTRIBUTE_NOT_FOUND;
  return { ok: true, id: input.id };
}

/**
 * Delete a filter. Its values and every product's value for it go with it (database cascade); no
 * `Product` row is changed. A filter in use needs `confirmed` — the staff page shows how many
 * products it is about to be removed from.
 */
export async function deleteAttributeForVendor(
  prisma: Db,
  vendorId: string,
  input: { id: string; confirmed: boolean },
): Promise<CatalogueWriteResult> {
  const row = await prisma.vendorAttribute.findFirst({
    where: { id: input.id, vendorId },
    select: { _count: { select: { productValues: true } } },
  });
  if (!row) return ATTRIBUTE_NOT_FOUND;
  if (row._count.productValues > 0 && !input.confirmed) return NOT_CONFIRMED;
  await prisma.vendorAttribute.deleteMany({ where: { id: input.id, vendorId } });
  return { ok: true, id: input.id };
}

/** Add a value to one of THIS vendor's filters, appended after its existing values. */
export async function createAttributeOptionForVendor(
  prisma: Db,
  vendorId: string,
  input: { attributeId: string; name: string; slug: string },
): Promise<CatalogueWriteResult> {
  const attribute = await prisma.vendorAttribute.findFirst({
    where: { id: input.attributeId, vendorId },
    select: { kind: true, _count: { select: { options: true } } },
  });
  if (!attribute) return ATTRIBUTE_NOT_FOUND;
  // #918 — a number filter holds a number per product, never a list of values.
  if (attribute.kind === "NUMBER") return NUMBER_HAS_NO_OPTIONS;
  if (attribute._count.options >= MAX_OPTIONS_PER_ATTRIBUTE) return TOO_MANY_OPTIONS;
  try {
    const created = await prisma.vendorAttributeOption.create({
      data: {
        attributeId: input.attributeId,
        name: input.name,
        slug: input.slug,
        sortOrder: attribute._count.options,
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE_OPTION;
    throw error;
  }
}

/** Rename and reposition a value. The slug never changes. */
export async function renameAttributeOptionForVendor(
  prismaWs: DbWs,
  vendorId: string,
  input: { id: string; name: string; sortOrder: number },
): Promise<CatalogueWriteResult> {
  const updated = await prismaWs.vendorAttributeOption.updateMany({
    where: { id: input.id, attribute: { vendorId } },
    data: { name: input.name, sortOrder: input.sortOrder },
  });
  if (updated.count === 0) return OPTION_NOT_FOUND;
  return { ok: true, id: input.id };
}

/** Delete a value; products carrying it lose that value only. In use needs `confirmed`. */
export async function deleteAttributeOptionForVendor(
  prisma: Db,
  vendorId: string,
  input: { id: string; confirmed: boolean },
): Promise<CatalogueWriteResult> {
  const row = await prisma.vendorAttributeOption.findFirst({
    where: { id: input.id, attribute: { vendorId } },
    select: { _count: { select: { productValues: true } } },
  });
  if (!row) return OPTION_NOT_FOUND;
  if (row._count.productValues > 0 && !input.confirmed) return NOT_CONFIRMED;
  await prisma.vendorAttributeOption.deleteMany({
    where: { id: input.id, attribute: { vendorId } },
  });
  return { ok: true, id: input.id };
}
