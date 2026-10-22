import { readFileSync } from "node:fs";
import { extname } from "node:path";
import * as XLSX from "@e965/xlsx";

/**
 * #1216 R7, R8 — the ONE file that imports the spreadsheet package. Everything the importer does
 * with the result lives in `lib/catalogue-import/` (pure) so the dependency stays out of the Worker
 * bundle: `tests/catalogue-import-guards.test.ts` fails if anything outside `scripts/` imports it.
 *
 * `.csv`, `.xlsx` and `.xls` (legacy BIFF) are read through the same package, so the three formats
 * reach the planner as the same shape: a grid of strings. Cells are returned as the text a person
 * sees (`raw: false`), except in CSV where the text IS the value (`raw: true`) — nothing is parsed
 * into a number or a date on the way in, because a price cell "£4.10" and a PLU "00123" must reach
 * the planner exactly as written.
 */

export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"] as const;

export interface SourceGrid {
  grid: string[][];
  /** 1-based row number of `grid[0]` in the original sheet (the sheet's range may not start at row 1). */
  firstRowNumber: number;
  sheetName: string;
}

export class UnsupportedFileError extends Error {}

export function readSourceGrid(path: string): SourceGrid {
  const extension = extname(path).toLowerCase();
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new UnsupportedFileError(
      `unsupported file type "${extension || "(none)"}"; accepted: ${ACCEPTED_EXTENSIONS.join(", ")}`,
    );
  }

  let workbook: XLSX.WorkBook;
  if (extension === ".csv") {
    // Strip a UTF-8 byte-order mark; SheetJS would otherwise keep it inside the first header cell.
    const text = readFileSync(path, "utf8").replace(/^﻿/, "");
    workbook = XLSX.read(text, { type: "string", raw: true });
  } else {
    workbook = XLSX.read(readFileSync(path), { type: "buffer" });
  }

  const sheetName = workbook.SheetNames[0];
  if (sheetName === undefined) throw new Error("the file contains no sheet");
  const sheet = workbook.Sheets[sheetName];

  const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });

  return {
    grid: grid.map((row) => row.map((cell) => String(cell ?? ""))),
    firstRowNumber: range ? range.s.r + 1 : 1,
    sheetName,
  };
}
