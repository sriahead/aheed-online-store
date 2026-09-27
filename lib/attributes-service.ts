import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  createAttributeForVendor,
  createAttributeOptionForVendor,
  deleteAttributeForVendor,
  deleteAttributeOptionForVendor,
  listAttributeDefinitions as listAttributeDefinitionsRepo,
  listAttributesForVendor as listAttributesForVendorRepo,
  renameAttributeForVendor,
  renameAttributeOptionForVendor,
  type AttributeDefinition,
  type AttributeKind,
  type AttributeRow,
} from "@/lib/repositories/attributes";
import type { CatalogueWriteResult } from "@/lib/repositories/products";

/**
 * Request-scoped wrapper around `lib/repositories/attributes.ts` (#912), beside it rather than
 * inside it for the reason `lib/brands-service.ts` gives: the repository's defining property is
 * that it reads no request context.
 *
 * Clients are constructed fresh on every call, never cached across requests. `getPrismaWs()` is
 * passed only to the two renames, which use `updateMany` (#382).
 *
 * The storefront reads go through the CURRENT vendor (host-resolved). The staff writes take the
 * vendor id `requireVendorRole` returned instead — the vendor the session is authorised for, never
 * a submitted field — so they are plain functions of `vendorId`.
 */

/** The current vendor's filters and values, for storefront resolution and facets. */
export async function listCurrentVendorAttributeDefinitions(): Promise<AttributeDefinition[]> {
  return listAttributeDefinitionsRepo(getPrisma(), await getCurrentVendorId());
}

export async function listAttributeDefinitions(vendorId: string): Promise<AttributeDefinition[]> {
  return listAttributeDefinitionsRepo(getPrisma(), vendorId);
}

export async function listAttributesForVendor(vendorId: string): Promise<AttributeRow[]> {
  return listAttributesForVendorRepo(getPrisma(), vendorId);
}

export async function createAttribute(
  vendorId: string,
  input: { name: string; slug: string; kind: AttributeKind; unit: string | null },
): Promise<CatalogueWriteResult> {
  return createAttributeForVendor(getPrisma(), vendorId, input);
}

export async function renameAttribute(
  vendorId: string,
  input: { id: string; name: string; sortOrder: number; showOnCard: boolean; unit: string | null },
): Promise<CatalogueWriteResult> {
  return renameAttributeForVendor(getPrismaWs(), vendorId, input);
}

export async function deleteAttribute(
  vendorId: string,
  input: { id: string; confirmed: boolean },
): Promise<CatalogueWriteResult> {
  return deleteAttributeForVendor(getPrisma(), vendorId, input);
}

export async function createAttributeOption(
  vendorId: string,
  input: { attributeId: string; name: string; slug: string },
): Promise<CatalogueWriteResult> {
  return createAttributeOptionForVendor(getPrisma(), vendorId, input);
}

export async function renameAttributeOption(
  vendorId: string,
  input: { id: string; name: string; sortOrder: number },
): Promise<CatalogueWriteResult> {
  return renameAttributeOptionForVendor(getPrismaWs(), vendorId, input);
}

export async function deleteAttributeOption(
  vendorId: string,
  input: { id: string; confirmed: boolean },
): Promise<CatalogueWriteResult> {
  return deleteAttributeOptionForVendor(getPrisma(), vendorId, input);
}
