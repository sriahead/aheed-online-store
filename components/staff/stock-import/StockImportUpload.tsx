"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startImportAction } from "@/features/admin/stock-import";
import { PRESET_LABELS, PRESET_NAMES } from "@/lib/stock-import/presets";
import { COLUMN_LABELS, columnLetter, type ColumnKey } from "@/lib/stock-import/settings";
import { readStockFile, type StockFile } from "./read-stock-file";

/**
 * #1578 R2/R3 — choose a stock file; the first time, pick which column is which from its first
 * rows. The server then checks every row against the catalogue and opens the review screen.
 * Nothing is written to products here.
 */

const SETUP_COLUMNS: ColumnKey[] = ["name", "size", "price", "plu", "barcode", "brand", "category"];
const PREVIEW_ROWS = 8;

const field =
  "rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm text-primary disabled:opacity-60";
const button =
  "rounded-2xl bg-action px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60";

export function StockImportUpload({
  hasSettings,
  categories,
}: {
  hasSettings: boolean;
  categories: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<StockFile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [headerRow, setHeaderRow] = useState<"AUTO" | "NONE">("NONE");
  const [columns, setColumns] = useState<Partial<Record<ColumnKey, string>>>({});
  const [defaultCategory, setDefaultCategory] = useState(categories[0]?.slug ?? "");
  const [presets, setPresets] = useState<string[]>(["general"]);

  async function start(stock: StockFile, withSetup: boolean) {
    setBusy("Checking every row against your catalogue…");
    setError(null);
    try {
      const result = await startImportAction({
        ...stock,
        setup: withSetup
          ? { headerRow, columns, defaultCategorySlug: defaultCategory, presets }
          : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        setBusy(null);
        return;
      }
      router.push(`/staff/products/import/${result.runId}`);
    } catch {
      setError("The file could not be checked. Try again, or split it into smaller files.");
      setBusy(null);
    }
  }

  async function onFile(selected: File | undefined) {
    if (!selected) return;
    setError(null);
    setBusy("Reading the file…");
    try {
      const stock = await readStockFile(selected);
      if (JSON.stringify(stock.grid).length > 900_000) {
        setError("The file is too large to upload in one go. Split it into smaller files.");
        setBusy(null);
        return;
      }
      setFile(stock);
      setBusy(null);
      if (hasSettings) await start(stock, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The file could not be read.");
      setBusy(null);
    }
  }

  const width = file ? Math.max(0, ...file.grid.slice(0, 50).map((r) => r.length)) : 0;
  const header = file?.grid.find((r) => r.some((c) => c.trim() !== "")) ?? [];
  const columnChoices = Array.from({ length: width }, (_, i) => ({
    value: headerRow === "NONE" ? columnLetter(i) : (header[i] ?? "").trim(),
    label:
      headerRow === "NONE"
        ? `Column ${columnLetter(i)}`
        : `${columnLetter(i)}: ${(header[i] ?? "").trim() || "(no heading)"}`,
  })).filter((c) => c.value !== "");

  return (
    <div className="space-y-6">
      <label className="block rounded-3xl border-2 border-dashed border-black/15 bg-white p-8 text-center">
        <span className="block text-base font-bold text-primary">Choose a stock or price file</span>
        <span className="mt-1 block text-sm text-primary-muted">
          Excel (.xlsx, .xls) or CSV, up to 2,000 rows. Nothing changes in your shop until you
          review the lines and press Apply.
        </span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="mt-4 text-sm"
          disabled={busy !== null}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>

      {busy && (
        <p role="status" className="text-sm font-semibold text-action">
          {busy}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {file && !hasSettings && (
        <section className="space-y-4 rounded-3xl border border-black/10 bg-white p-5">
          <div>
            <h2 className="text-lg font-semibold text-primary">
              First, tell us how your file is laid out
            </h2>
            <p className="text-sm text-primary-muted">
              Asked once; you can change it later under Import settings.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-primary-muted">Row</th>
                  {Array.from({ length: width }, (_, i) => (
                    <th key={i} className="px-2 py-1 text-primary-muted">
                      {columnLetter(i)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {file.grid.slice(0, PREVIEW_ROWS).map((row, r) => (
                  <tr key={r} className="border-t border-black/5">
                    <td className="px-2 py-1 text-primary-muted">{r + 1}</td>
                    {Array.from({ length: width }, (_, i) => (
                      <td key={i} className="px-2 py-1 text-primary">
                        {row[i] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-bold text-primary">
              Does the first row hold column headings?
            </legend>
            <label className="mr-4 text-sm text-primary">
              <input
                type="radio"
                name="headerRow"
                checked={headerRow === "AUTO"}
                onChange={() => {
                  setHeaderRow("AUTO");
                  setColumns({});
                }}
              />{" "}
              Yes
            </label>
            <label className="text-sm text-primary">
              <input
                type="radio"
                name="headerRow"
                checked={headerRow === "NONE"}
                onChange={() => {
                  setHeaderRow("NONE");
                  setColumns({});
                }}
              />{" "}
              No, products start on the first row
            </label>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            {SETUP_COLUMNS.map((key) => (
              <label key={key} className="flex flex-col gap-1 text-sm font-semibold text-primary">
                {COLUMN_LABELS[key]}
                {key === "name" ? " (required)" : ""}
                <select
                  className={field}
                  value={columns[key] ?? ""}
                  onChange={(e) => setColumns({ ...columns, [key]: e.target.value || undefined })}
                >
                  <option value="">{key === "name" ? "Choose…" : "Not in this file"}</option>
                  {columnChoices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="flex flex-col gap-1 text-sm font-semibold text-primary">
              Category for rows that don&apos;t say
              <select
                className={field}
                value={defaultCategory}
                onChange={(e) => setDefaultCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-bold text-primary">
              What do you sell? (naming and filter rules)
            </legend>
            {PRESET_NAMES.map((p) => (
              <label key={p} className="mr-4 inline-block text-sm text-primary">
                <input
                  type="checkbox"
                  checked={presets.includes(p)}
                  onChange={(e) =>
                    setPresets(e.target.checked ? [...presets, p] : presets.filter((x) => x !== p))
                  }
                />{" "}
                {PRESET_LABELS[p]}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className={button}
            disabled={busy !== null || !columns.name || !defaultCategory}
            onClick={() => start(file, true)}
          >
            Save and check the file
          </button>
        </section>
      )}
    </div>
  );
}
