"use client";

import { parseCsvToGrid } from "@/lib/catalogue-import/csv";

/**
 * #1578 — read an uploaded stock file in the browser: the first sheet as a grid of text (as the
 * spreadsheet shows it) and the file's SHA-256. Excel files are read with SheetJS, loaded from its
 * CDN only when needed, as the #1216 importer did.
 */

declare global {
  interface Window {
    XLSX?: {
      read(
        data: ArrayBuffer,
        opts: { type: string; raw?: boolean; codepage?: number },
      ): { SheetNames: string[]; Sheets: Record<string, unknown> };
      utils: {
        sheet_to_json<T>(
          sheet: unknown,
          opts: { header: number; raw: boolean; defval: string },
        ): T[];
      };
    };
  }
}

const SHEETJS_SRC = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";

function loadSheetJs(): Promise<NonNullable<typeof window.XLSX>> {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const done = () =>
      window.XLSX ? resolve(window.XLSX) : reject(new Error("The Excel reader did not start."));
    const fail = () =>
      reject(
        new Error("The Excel reader could not be loaded. Save the file as CSV and try again."),
      );
    const existing = document.getElementById("sheetjs-script");
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", fail);
      return;
    }
    const script = document.createElement("script");
    script.id = "sheetjs-script";
    script.src = SHEETJS_SRC;
    script.async = true;
    script.onload = done;
    script.onerror = fail;
    document.head.appendChild(script);
  });
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface StockFile {
  fileName: string;
  fileSha256: string;
  grid: string[][];
}

export async function readStockFile(file: File): Promise<StockFile> {
  const lower = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  let grid: string[][];
  if (lower.endsWith(".csv")) {
    grid = parseCsvToGrid(new TextDecoder().decode(buffer));
  } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const xlsx = await loadSheetJs();
    const wb = xlsx.read(buffer, { type: "buffer", raw: false, codepage: 1252 });
    const first = wb.SheetNames[0];
    if (!first) throw new Error("The spreadsheet has no sheets.");
    grid = xlsx.utils.sheet_to_json<string[]>(wb.Sheets[first], {
      header: 1,
      raw: false,
      defval: "",
    });
  } else {
    throw new Error("Upload an Excel (.xlsx, .xls) or CSV file.");
  }
  return {
    fileName: file.name,
    fileSha256: await sha256(buffer),
    grid: grid.map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c)))),
  };
}
