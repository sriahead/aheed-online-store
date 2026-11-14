"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listCategoriesForAdmin } from "@/lib/categories-service";
import {
  applyStockImportChunk,
  decideStockImportLine,
  getStockImportSettings,
  reopenFailedStockImportLines,
  replanStockImportRun,
  saveStockImportSettings,
  searchStockImportProducts,
  startStockImportRun,
  undoStockImportRun,
} from "@/lib/stock-import-service";
import {
  initialSettings,
  parseSettingsForm,
  type SettingsFormState,
} from "@/lib/stock-import/settings-form";
import type { ColumnKey } from "@/lib/stock-import/settings";
import type {
  ApplyChunkResult,
  ImportProductSummary,
  UndoResult,
} from "@/lib/repositories/stock-import";

/**
 * #1578 — the staff stock import's server actions. Store admins only: each action checks
 * `requireVendorRole("ADMIN")` itself and takes the store from it, never from the payload.
 * (A "use server" file may export only async functions; state shapes live in
 * lib/stock-import/settings-form.ts.)
 */

type Failure = { ok: false; error: string };

async function admin() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok)
    return {
      ok: false as const,
      error:
        auth.status === 401
          ? "Please sign in as a store admin to import stock."
          : "Only a store admin can import stock.",
    };
  return auth;
}

const MAX_COLUMNS = 60;
const MAX_CELL = 500;

function cleanGrid(grid: unknown): string[][] | null {
  if (!Array.isArray(grid)) return null;
  const out: string[][] = [];
  for (const row of grid) {
    if (!Array.isArray(row)) return null;
    out.push(
      row
        .slice(0, MAX_COLUMNS)
        .map((c) => (c === null || c === undefined ? "" : String(c).slice(0, MAX_CELL))),
    );
  }
  return out;
}

export async function startImportAction(payload: {
  fileName: string;
  fileSha256: string;
  grid: unknown;
  setup?: {
    headerRow: "AUTO" | "NONE";
    columns: Partial<Record<ColumnKey, string>>;
    defaultCategorySlug: string;
    presets: string[];
  };
}): Promise<{ ok: true; runId: string } | Failure> {
  const auth = await admin();
  if (!auth.ok) return auth;
  const grid = cleanGrid(payload.grid);
  if (!grid) return { ok: false, error: "The file could not be read." };
  const fileName = String(payload.fileName ?? "").slice(0, 200) || "upload";
  const fileSha256 = String(payload.fileSha256 ?? "").slice(0, 64);

  if (payload.setup) {
    const existing = await getStockImportSettings(auth.vendorId);
    if (!existing) {
      const settings = initialSettings(payload.setup);
      if (!settings.ok) return settings;
      const saved = await saveStockImportSettings(auth.vendorId, settings.value);
      if (!saved.ok) return saved;
    }
  }
  const run = await startStockImportRun(auth.vendorId, {
    fileName,
    fileSha256,
    grid,
    userId: auth.user.id,
  });
  if (run.ok) revalidatePath("/staff/products/import");
  return run;
}

export async function saveImportSettingsAction(
  _prev: SettingsFormState,
  form: FormData,
): Promise<SettingsFormState> {
  const auth = await admin();
  if (!auth.ok) return { error: auth.error, message: null };
  const categories = await listCategoriesForAdmin(auth.vendorId);
  const parsed = parseSettingsForm(
    form,
    categories.map((c) => ({ slug: c.slug, name: c.name })),
  );
  if (!parsed.ok) return { error: parsed.error, message: null };
  const saved = await saveStockImportSettings(auth.vendorId, parsed.value);
  if (!saved.ok) return { error: saved.error, message: null };
  revalidatePath("/staff/products/import");
  return {
    error: null,
    message:
      "Saved. Open imports that were checked with the old settings need “Refresh plan” before they can be applied.",
  };
}

export async function decideImportLineAction(input: {
  runId: string;
  lineId: string;
  decision: "UPDATE" | "CREATE" | "SKIP" | "HOLD";
  targetProductId: string | null;
  note: string;
}): Promise<{ ok: true } | Failure> {
  const auth = await admin();
  if (!auth.ok) return auth;
  if (!["UPDATE", "CREATE", "SKIP", "HOLD"].includes(input.decision))
    return { ok: false, error: "Choose Update, Create or Skip." };
  const result = await decideStockImportLine(auth.vendorId, input.lineId, auth.user.id, {
    decision: input.decision,
    targetProductId: input.targetProductId,
    note: String(input.note ?? ""),
  });
  if (result.ok) revalidatePath(`/staff/products/import/${input.runId}`);
  return result;
}

/** One chunk of an apply; `first` retries the run's failed lines once (R5). */
export async function applyImportChunkAction(input: {
  runId: string;
  first: boolean;
}): Promise<ApplyChunkResult> {
  const auth = await admin();
  if (!auth.ok) return auth;
  if (input.first) await reopenFailedStockImportLines(auth.vendorId, input.runId);
  const result = await applyStockImportChunk(auth.vendorId, input.runId);
  if (result.ok && result.remaining === 0) {
    revalidatePath(`/staff/products/import/${input.runId}`);
    revalidatePath("/staff/products");
  }
  return result;
}

export async function replanImportAction(input: {
  runId: string;
}): Promise<{ ok: true; runId: string } | Failure> {
  const auth = await admin();
  if (!auth.ok) return auth;
  const result = await replanStockImportRun(auth.vendorId, input.runId);
  if (result.ok) revalidatePath(`/staff/products/import/${input.runId}`);
  return result;
}

export async function undoImportAction(input: {
  runId: string;
}): Promise<{ ok: true; result: UndoResult } | Failure> {
  const auth = await admin();
  if (!auth.ok) return auth;
  const result = await undoStockImportRun(auth.vendorId, input.runId);
  if (result.ok) {
    revalidatePath(`/staff/products/import/${input.runId}`);
    revalidatePath("/staff/products");
  }
  return result;
}

export async function searchImportProductsAction(input: {
  query: string;
}): Promise<ImportProductSummary[]> {
  const auth = await admin();
  if (!auth.ok) return [];
  return searchStockImportProducts(auth.vendorId, String(input.query ?? "").slice(0, 100));
}
