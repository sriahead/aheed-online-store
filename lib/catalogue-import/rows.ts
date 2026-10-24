import { normaliseDepartment } from "@/lib/catalogue-import-policy";
import type { ImportProfile } from "./profile";

/**
 * #1216 R10 — a spreadsheet grid to data rows. Pure: the I/O that produced the grid (and the one
 * dependency that reads Excel) lives in `scripts/lib/read-spreadsheet.ts`.
 *
 * SCAFFOLDING IS DISCARDED BY CONTENT, NEVER BY ROW ARITHMETIC. A report printed above the header
 * and a totals block below the data both move when the client's report generator changes, so the
 * header is found by the names the profile maps, and a footer row is one with neither a PLU nor a
 * department. A row with a department but no PLU is NOT scaffolding — it is a product with a
 * missing code, and is rejected by the planner so it stays visible.
 */

/** How many leading rows are searched for the header. */
export const HEADER_SEARCH_ROWS = 20;

export interface SourceRow {
  /** 1-based row number in the ORIGINAL file, counting the scaffolding above the header. */
  sourceRow: number;
  plu: string;
  name: string;
  description: string;
  priceRaw: string;
  department: string;
  subDepartment: string;
  vatRaw: string;
}

export type ReadRowsResult =
  | {
      ok: true;
      headerSourceRow: number;
      rows: SourceRow[];
      discarded: { aboveHeader: number; footer: number };
    }
  | { ok: false; error: string };

function key(cell: string): string {
  return normaliseDepartment(cell);
}

export function readRows(
  grid: readonly (readonly string[])[],
  profile: ImportProfile,
  firstRowNumber = 1,
): ReadRowsResult {
  const mapped = Object.entries(profile.columns).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  const wanted = mapped.map(([, header]) => key(header));

  let headerIndex = -1;
  let bestMissing: string[] = wanted;
  const searchable = Math.min(grid.length, HEADER_SEARCH_ROWS);
  for (let i = 0; i < searchable; i += 1) {
    const present = new Set(grid[i].map((cell) => key(cell ?? "")));
    const missing = mapped.map(([, header]) => header).filter((h) => !present.has(key(h)));
    if (missing.length === 0) {
      headerIndex = i;
      break;
    }
    if (missing.length < bestMissing.length) bestMissing = missing;
  }

  if (headerIndex < 0) {
    const names = mapped
      .map(([, header]) => header)
      .filter((header) => bestMissing.some((m) => key(m) === key(header)));
    return {
      ok: false,
      error: `no header row found in the first ${HEADER_SEARCH_ROWS} rows; the profile maps column(s) not present: ${names
        .map((n) => `"${n}"`)
        .join(", ")}`,
    };
  }

  const header = grid[headerIndex].map((cell) => key(cell ?? ""));
  const at = (name: string | undefined): number =>
    name === undefined ? -1 : header.indexOf(key(name));
  const col = {
    plu: at(profile.columns.plu),
    name: at(profile.columns.name),
    price: at(profile.columns.price),
    department: at(profile.columns.department),
    subDepartment: at(profile.columns.subDepartment),
    description: at(profile.columns.description),
    vat: at(profile.columns.vat),
  };
  const cell = (row: readonly string[], index: number): string =>
    index < 0 ? "" : String(row[index] ?? "").trim();

  const rows: SourceRow[] = [];
  let footer = 0;
  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const raw = grid[i];
    const plu = cell(raw, col.plu);
    const department = cell(raw, col.department);
    if (plu === "" && department === "") {
      footer += 1;
      continue;
    }
    rows.push({
      sourceRow: firstRowNumber + i,
      plu,
      name: cell(raw, col.name),
      description: cell(raw, col.description),
      priceRaw: cell(raw, col.price),
      department,
      subDepartment: cell(raw, col.subDepartment),
      vatRaw: cell(raw, col.vat),
    });
  }

  if (rows.length === 0) return { ok: false, error: "the file has a header row but no data rows" };

  return {
    ok: true,
    headerSourceRow: firstRowNumber + headerIndex,
    rows,
    discarded: { aboveHeader: headerIndex, footer },
  };
}
