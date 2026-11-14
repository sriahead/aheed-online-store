import { getPrisma, getPrismaWs } from "@/lib/db";
import {
  applyImportChunk,
  createImportRun,
  decideImportLine,
  getImportRun,
  listImportRuns,
  readImportSettings,
  reopenFailedLines,
  replanImportRun,
  saveImportSettings,
  searchImportProducts,
  undoImportRun,
  type DecideInput,
} from "@/lib/repositories/stock-import";
import type { ImportSettingsData } from "@/lib/stock-import/settings";

/**
 * #1578 — request-scoped facade over `lib/repositories/stock-import.ts` for the staff screen. Reads
 * go over HTTP; anything that opens a transaction or writes many rows uses the WebSocket client.
 * The caller (a page or server action) has already checked the store-admin role.
 */

export const getStockImportSettings = (vendorId: string) =>
  readImportSettings(getPrisma(), vendorId);

export const saveStockImportSettings = (vendorId: string, data: ImportSettingsData) =>
  saveImportSettings(getPrismaWs(), vendorId, data);

export const listStockImportRuns = (vendorId: string) => listImportRuns(getPrisma(), vendorId);

export const getStockImportRun = (vendorId: string, runId: string) =>
  getImportRun(getPrisma(), vendorId, runId);

export const startStockImportRun = (
  vendorId: string,
  input: { fileName: string; fileSha256: string; grid: string[][]; userId: string },
) => createImportRun(getPrismaWs(), vendorId, input);

export const replanStockImportRun = (vendorId: string, runId: string) =>
  replanImportRun(getPrismaWs(), vendorId, runId);

export const decideStockImportLine = (
  vendorId: string,
  lineId: string,
  userId: string,
  input: DecideInput,
) => decideImportLine(getPrisma(), vendorId, lineId, userId, input);

export const reopenFailedStockImportLines = (vendorId: string, runId: string) =>
  reopenFailedLines(getPrismaWs(), vendorId, runId);

export const applyStockImportChunk = (vendorId: string, runId: string) =>
  applyImportChunk(getPrismaWs(), vendorId, runId);

export const undoStockImportRun = (vendorId: string, runId: string) =>
  undoImportRun(getPrismaWs(), vendorId, runId);

export const searchStockImportProducts = (vendorId: string, query: string) =>
  searchImportProducts(getPrisma(), vendorId, query);
