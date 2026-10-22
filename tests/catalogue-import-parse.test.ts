import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "@e965/xlsx";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readRows } from "../lib/catalogue-import/rows";
import { importProfileSchema, type ImportProfile } from "../lib/catalogue-import/profile";
import {
  ACCEPTED_EXTENSIONS,
  readSourceGrid,
  UnsupportedFileError,
} from "../scripts/lib/read-spreadsheet";

/**
 * #1216 R8-R10 — reading a file into a grid, and a grid into data rows. The three formats are
 * generated here from one set of cells, by the same package the importer reads them with, so
 * "equivalent content gives an equivalent grid" is a statement about the reader and not about a
 * fixture somebody saved by hand. No client data appears anywhere in this file.
 */

const PROFILE: ImportProfile = importProfileSchema.parse({
  columns: {
    plu: "PLU",
    name: "Description",
    price: "Price",
    department: "Dept",
    subDepartment: "SubDept",
    vat: "VAT",
  },
  unit: { pattern: "\\d+g", defaultLabel: "each" },
  policy: { byDepartment: {}, uncertainDepartments: [], unrestrictedDepartments: [] },
});

const PREAMBLE = [["Current Stock List"], ["Printed On : 01/01/2025"], ["Department : All"]];
const HEADER = ["No", "PLU", "Description", "Price", "VAT", "Dept", "SubDept"];
const DATA = [
  ["1", "00123", "TEA BAGS 80s", "£2.10", "20.00", "GROCERIES", "TEA"],
  ["2", "00124", 'SAUCE, "HOT"', "£1,234.50", "0", "GROCERIES", "SAUCES"],
];
const FOOTER = [
  ["", "", "", "", "", "", ""],
  ["", "", "", "", "", "", ""],
];
const CELLS = [...PREAMBLE, HEADER, ...DATA, ...FOOTER];

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "catalogue-import-parse-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function writeBook(name: string, bookType: XLSX.BookType): string {
  const book = XLSX.utils.book_new();
  // Every cell is written as TEXT so "00123" keeps its zeros in every format.
  const sheet = XLSX.utils.aoa_to_sheet(CELLS);
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    sheet[address] = { t: "s", v: String(sheet[address].v ?? "") };
  }
  XLSX.utils.book_append_sheet(book, sheet, "StockList");
  const path = join(dir, name);
  writeFileSync(path, XLSX.write(book, { type: "buffer", bookType }));
  return path;
}

/** Normalise the trailing-blank-row differences each format legitimately has. */
function trimmed(grid: string[][]): string[][] {
  return grid.map((row) => row.map((c) => c.trim()));
}

describe("readSourceGrid (R8)", () => {
  it("accepts exactly .csv, .xlsx and .xls", () => {
    expect([...ACCEPTED_EXTENSIONS]).toEqual([".csv", ".xlsx", ".xls"]);
  });

  it("rejects any other extension and names the accepted ones", () => {
    const path = join(dir, "notes.txt");
    writeFileSync(path, "x");
    expect(() => readSourceGrid(path)).toThrow(UnsupportedFileError);
    expect(() => readSourceGrid(path)).toThrow(/\.csv, \.xlsx, \.xls/);
  });

  it("csv, xlsx and xls of the same cells yield the same rows", () => {
    const csv = join(dir, "same.csv");
    writeFileSync(
      csv,
      CELLS.map((r) =>
        r.map((c) => (/[,"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","),
      ).join("\n"),
    );
    const results = [
      readSourceGrid(csv),
      readSourceGrid(writeBook("same.xlsx", "xlsx")),
      readSourceGrid(writeBook("same.xls", "biff8")),
    ].map((g) => readRows(g.grid, PROFILE, g.firstRowNumber));

    for (const r of results) expect(r.ok).toBe(true);
    const [csvRows, xlsxRows, xlsRows] = results.map((r) => (r.ok ? r.rows : []));
    expect(xlsxRows).toEqual(csvRows);
    expect(xlsRows).toEqual(csvRows);
    expect(csvRows.map((r) => r.plu)).toEqual(["00123", "00124"]);
    expect(csvRows.map((r) => r.sourceRow)).toEqual([5, 6]);
  });

  it("keeps a UTF-8 byte-order mark out of the first header cell", () => {
    const path = join(dir, "bom.csv");
    writeFileSync(path, "﻿PLU,Description,Price,Dept\n1,A,£1.00,X\n");
    expect(readSourceGrid(path).grid[0][0]).toBe("PLU");
  });

  it("reads CRLF line ends", () => {
    const path = join(dir, "crlf.csv");
    writeFileSync(path, "PLU,Description,Price,Dept\r\n1,A,£1.00,X\r\n2,B,£2.00,Y\r\n");
    const { grid } = readSourceGrid(path);
    expect(trimmed(grid)).toEqual([
      ["PLU", "Description", "Price", "Dept"],
      ["1", "A", "£1.00", "X"],
      ["2", "B", "£2.00", "Y"],
    ]);
  });

  it("reads a quoted field containing a comma and an escaped quote", () => {
    const path = join(dir, "quoted.csv");
    writeFileSync(path, 'PLU,Description,Price,Dept\n1,"SAUCE, ""HOT""",£1.00,X\n');
    expect(readSourceGrid(path).grid[1][1]).toBe('SAUCE, "HOT"');
  });

  it("does not turn a leading-zero PLU or a £ price into a number", () => {
    const path = join(dir, "text.csv");
    writeFileSync(path, "PLU,Description,Price,Dept\n00123,A,£4.10,X\n");
    expect(readSourceGrid(path).grid[1]).toEqual(["00123", "A", "£4.10", "X"]);
  });
});

describe("readRows (R9, R10)", () => {
  const read = (grid: string[][], firstRowNumber = 1) => readRows(grid, PROFILE, firstRowNumber);

  it("finds the header after a 3-row preamble and counts what it discards", () => {
    const result = read(CELLS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.headerSourceRow).toBe(4);
    expect(result.discarded).toEqual({ aboveHeader: 3, footer: 2 });
    expect(result.rows).toHaveLength(2);
  });

  it("finds a header on source row 7", () => {
    const pad = [["a"], ["b"], ["c"], ["d"], ["e"], ["f"]];
    const result = read([...pad, HEADER, ...DATA]);
    expect(result.ok && result.headerSourceRow).toBe(7);
    expect(result.ok && result.discarded.aboveHeader).toBe(6);
  });

  it("matches header names after trimming, collapsing whitespace and upper-casing", () => {
    const messy = [" plu ", "  description", "PRICE", "dept", "subdept ", "vat", "No"];
    const result = read([messy, ...DATA.map((r) => [r[1], r[2], r[3], r[5], r[6], r[4], r[0]])]);
    expect(result.ok).toBe(true);
  });

  it("reports source row numbers from the sheet's own first row", () => {
    const result = read([HEADER, ...DATA], 10);
    expect(result.ok && result.rows.map((r) => r.sourceRow)).toEqual([11, 12]);
  });

  it("discards a footer row (no PLU and no department) but keeps a row with a department and no PLU", () => {
    const orphan = ["3", "", "NO CODE", "£1.00", "0", "GROCERIES", "TEA"];
    const result = read([HEADER, ...DATA, orphan, ["", "", "", "", "", "", ""]]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.discarded.footer).toBe(1);
    expect(result.rows.map((r) => r.plu)).toEqual(["00123", "00124", ""]);
  });

  it("fails, naming the column, when the profile maps a header the file does not have", () => {
    const profile = importProfileSchema.parse({
      ...PROFILE,
      columns: { ...PROFILE.columns, vat: "Nope" },
    });
    const result = readRows([HEADER, ...DATA], profile);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('"Nope"');
  });

  it("fails when there is no header row, and when there is a header but no data", () => {
    expect(read([["x"], ["y"]]).ok).toBe(false);
    const noData = read([HEADER]);
    expect(noData.ok).toBe(false);
    expect(!noData.ok && noData.error).toMatch(/no data rows/);
  });

  it("only searches the first 20 rows for the header", () => {
    const deep = [...Array.from({ length: 20 }, () => ["x"]), HEADER, ...DATA];
    expect(read(deep).ok).toBe(false);
  });
});

describe("importProfileSchema (R9)", () => {
  it("is strict: an unknown key at any level fails", () => {
    expect(importProfileSchema.safeParse({ ...PROFILE, extra: 1 }).success).toBe(false);
    expect(
      importProfileSchema.safeParse({ ...PROFILE, columns: { ...PROFILE.columns, extra: "x" } })
        .success,
    ).toBe(false);
  });

  it("rejects a unit pattern that is not a regular expression", () => {
    const bad = { ...PROFILE, unit: { pattern: "(", defaultLabel: "each" } };
    expect(importProfileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a restriction class that does not exist", () => {
    const bad = { ...PROFILE, policy: { ...PROFILE.policy, byDepartment: { X: "DANGEROUS" } } };
    expect(importProfileSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts the committed example profile", async () => {
    const { readFileSync } = await import("node:fs");
    const json = JSON.parse(readFileSync("prisma/manifests/example-import-profile.json", "utf8"));
    expect(importProfileSchema.safeParse(json).success).toBe(true);
  });
});
