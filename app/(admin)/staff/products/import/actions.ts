"use server";

import { requireVendorRole } from "@/lib/auth-rbac";
import { resolveImportProfile } from "@/lib/catalogue-import/default-profile";
import { readRows } from "@/lib/catalogue-import/rows";
import { buildPlan } from "@/lib/catalogue-import/plan";
import {
  countExistingProductsBySlugs,
  applyImportPlanForVendor,
} from "@/lib/catalogue-import-service";
import type { ApplyActionResponse, PreviewSummary, ValidateActionResponse } from "./types";

/** Maximum rows accepted in one staff import payload to protect isolate resources. */
const MAX_IMPORT_ROWS = 10_000;

export async function validateStockFileAction(payload: {
  grid: string[][];
  fileName?: string;
}): Promise<ValidateActionResponse> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return {
      ok: false,
      error:
        auth.status === 401
          ? "You must be signed in to import catalogue files."
          : "Store admin permission required to import catalogue files.",
    };
  }

  const grid = payload.grid;
  if (!Array.isArray(grid) || grid.length === 0) {
    return { ok: false, error: "Uploaded file contains no rows." };
  }

  if (grid.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `Payload exceeds ${MAX_IMPORT_ROWS.toLocaleString()} row limit. Please upload in smaller batches.`,
    };
  }

  const profile = resolveImportProfile(grid);
  const readResult = readRows(grid, profile);
  if (!readResult.ok) {
    return { ok: false, error: readResult.error };
  }

  const plan = buildPlan(readResult.rows, profile);

  // Count existing products matching planned slugs through the catalogue import service
  const matchingExistingProducts = await countExistingProductsBySlugs(
    auth.vendorId,
    plan.products.map((p) => p.slug),
  );

  const preview: PreviewSummary = {
    fileName: payload.fileName ?? "stock-upload",
    totalGridRows: grid.length,
    dataRowCount: readResult.rows.length,
    headerSourceRow: readResult.headerSourceRow,
    candidateAdditions: plan.products.length,
    candidateCategories: plan.categories.length,
    matchingExistingProducts,
    rejectedCount: plan.rejected.length,
    rejectedRows: plan.rejected,
    unreviewedDepartments: plan.unreviewedDepartments,
    restrictionCounts: plan.restrictionCounts,
  };

  return { ok: true, preview };
}

export async function applyStockFileAction(payload: {
  grid: string[][];
  fileName?: string;
}): Promise<ApplyActionResponse> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return {
      ok: false,
      error:
        auth.status === 401
          ? "You must be signed in to import catalogue files."
          : "Store admin permission required to import catalogue files.",
    };
  }

  const grid = payload.grid;
  if (!Array.isArray(grid) || grid.length === 0) {
    return { ok: false, error: "Uploaded file contains no rows." };
  }

  if (grid.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `Payload exceeds ${MAX_IMPORT_ROWS.toLocaleString()} row limit.`,
    };
  }

  const profile = resolveImportProfile(grid);
  const readResult = readRows(grid, profile);
  if (!readResult.ok) {
    return { ok: false, error: readResult.error };
  }

  const plan = buildPlan(readResult.rows, profile);

  // Execute writes through the catalogue import service
  const result = await applyImportPlanForVendor(auth.vendorId, plan);

  return {
    ok: true,
    receipt: {
      categoriesCreated: result.categoriesCreated,
      productsCreated: result.productsCreated,
      existingUnchanged: result.existingUnchanged,
      restrictionTightened: result.restrictionTightened,
      failedDepartments: result.failedDepartments,
      departments: result.departments,
      drift: result.drift,
    },
  };
}
