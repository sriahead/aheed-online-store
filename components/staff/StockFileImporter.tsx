"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { IconMedallion } from "@/components/icons/IconMedallion";
import { parseCsvToGrid } from "@/lib/catalogue-import/csv";
import {
  validateStockFileAction,
  applyStockFileAction,
} from "@/app/(admin)/staff/products/import/actions";
import type {
  ApplyReceiptSummary,
  PreviewSummary,
} from "@/app/(admin)/staff/products/import/types";

declare global {
  interface Window {
    XLSX?: {
      read(
        data: ArrayBuffer,
        opts: { type: string; raw?: boolean },
      ): {
        SheetNames: string[];
        Sheets: Record<string, unknown>;
      };
      utils: {
        sheet_to_json<T>(
          sheet: unknown,
          opts: { header: number; raw: boolean; defval: string },
        ): T[];
      };
    };
  }
}

async function loadBrowserSheetJs(): Promise<NonNullable<typeof window.XLSX>> {
  if (window.XLSX) return window.XLSX;

  return new Promise((resolve, reject) => {
    const existing = document.getElementById("sheetjs-script");
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.XLSX) resolve(window.XLSX);
        else reject(new Error("SheetJS failed to initialize"));
      });
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Excel reader script")),
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "sheetjs-script";
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    script.async = true;
    script.onload = () => {
      if (window.XLSX) resolve(window.XLSX);
      else reject(new Error("SheetJS failed to initialize"));
    };
    script.onerror = () =>
      reject(new Error("Failed to load Excel reader script from CDN. Please use a CSV file."));
    document.head.appendChild(script);
  });
}

export function StockFileImporter() {
  const [file, setFile] = useState<File | null>(null);
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [applying, setApplying] = useState(false);
  const [receipt, setReceipt] = useState<ApplyReceiptSummary | null>(null);

  const handleFileChange = async (selectedFile: File) => {
    setError(null);
    setReceipt(null);
    setPreview(null);
    setGrid(null);
    setFile(selectedFile);
    setParsing(true);

    try {
      let parsedGrid: string[][];
      const lower = selectedFile.name.toLowerCase();

      if (lower.endsWith(".csv")) {
        const text = await selectedFile.text();
        parsedGrid = parseCsvToGrid(text);
      } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        const xlsx = await loadBrowserSheetJs();
        const buffer = await selectedFile.arrayBuffer();
        const wb = xlsx.read(buffer, { type: "buffer", raw: false });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) throw new Error("The spreadsheet contains no sheets.");
        const sheet = wb.Sheets[firstSheetName];
        parsedGrid = xlsx.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          raw: false,
          defval: "",
        });
      } else {
        throw new Error("Unsupported file format. Please upload a .csv, .xlsx, or .xls file.");
      }

      if (parsedGrid.length > 10_000) {
        throw new Error("Payload exceeds 10,000 row limit. Please reduce the number of rows.");
      }

      setGrid(parsedGrid);

      // Phase 1: Validate & Preview
      const result = await validateStockFileAction({
        grid: parsedGrid,
        fileName: selectedFile.name,
      });

      if (!result.ok) {
        setError(result.error);
      } else {
        setPreview(result.preview);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process stock file.");
    } finally {
      setParsing(false);
    }
  };

  const handleApply = async () => {
    if (!grid) return;
    setApplying(true);
    setError(null);

    try {
      const result = await applyStockFileAction({
        grid,
        fileName: file?.name,
      });

      if (!result.ok) {
        setError(result.error);
      } else {
        setReceipt(result.receipt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply catalogue changes.");
    } finally {
      setApplying(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setGrid(null);
    setPreview(null);
    setReceipt(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Upload Box */}
      {!receipt && (
        <div className="rounded-2xl border-2 border-dashed border-black/15 bg-surface-muted p-8 text-center transition hover:border-primary/50">
          <IconMedallion icon="upload" size={40} className="mx-auto mb-3" decorative />
          <h2 className="text-lg font-semibold text-primary">Upload Stock File</h2>
          <p className="mt-1 text-sm text-primary-muted">
            Drag and drop your catalogue file (.csv, .xlsx, .xls) up to 10,000 rows.
          </p>

          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">
            <Icon name="upload" className="h-4 w-4" />
            <span>Select file</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileChange(f);
              }}
              disabled={parsing || applying}
            />
          </label>

          {file && (
            <p className="mt-3 text-xs font-semibold text-primary">
              Selected: <span className="font-mono text-xs">{file.name}</span> (
              {Math.round(file.size / 1024)} KB)
            </p>
          )}
        </div>
      )}

      {/* Parsing / Loading indicator */}
      {parsing && (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-black/10 bg-white p-6 text-sm text-primary">
          <Icon name="loader-circle" className="h-5 w-5 animate-spin text-primary" />
          <span>Validating stock file in memory...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-tint p-5 text-sm text-danger">
          <Icon name="circle-alert" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Import Notice</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Phase 1: Preview Screen */}
      {preview && !receipt && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4">
              <div>
                <h3 className="text-xl font-bold text-primary">Pre-Import Validation Preview</h3>
                <p className="text-xs text-primary-muted">
                  Dry-run verification complete. Zero database writes have been made.
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-xl border border-black/10 px-3 py-1.5 text-xs font-semibold text-primary-muted hover:bg-surface-muted"
              >
                Upload different file
              </button>
            </div>

            {/* Metrics Grid */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-black/10 bg-surface-muted p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-primary-muted">
                  New Products
                </p>
                <p className="mt-1 text-2xl font-black text-primary">
                  {preview.candidateAdditions}
                </p>
                <p className="text-[11px] text-primary-muted">Ready to add</p>
              </div>

              <div className="rounded-xl border border-black/10 bg-surface-muted p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-primary-muted">
                  Categories
                </p>
                <p className="mt-1 text-2xl font-black text-primary">
                  {preview.candidateCategories}
                </p>
                <p className="text-[11px] text-primary-muted">Departments mapped</p>
              </div>

              <div className="rounded-xl border border-black/10 bg-surface-muted p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-primary-muted">
                  Existing Records
                </p>
                <p className="mt-1 text-2xl font-black text-primary">
                  {preview.matchingExistingProducts}
                </p>
                <p className="text-[11px] text-primary-muted">Preserved without change</p>
              </div>

              <div className="rounded-xl border border-black/10 bg-surface-muted p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-primary-muted">
                  Rejections
                </p>
                <p className="mt-1 text-2xl font-black text-danger">{preview.rejectedCount}</p>
                <p className="text-[11px] text-primary-muted">Duplicates or blank rows</p>
              </div>
            </div>

            {/* ADR-007 Restrictions Breakdown */}
            <div className="mt-6 rounded-xl border border-black/10 bg-surface-muted p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                ADR-007 Restriction Classification
              </h4>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-danger-tint px-3 py-1 text-xs font-bold text-danger">
                  Age Restricted: {preview.restrictionCounts.AGE_RESTRICTED}
                </span>
                <span className="rounded-full bg-danger-tint px-3 py-1 text-xs font-bold text-danger">
                  Prohibited: {preview.restrictionCounts.PROHIBITED}
                </span>
                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800">
                  Not Deliverable: {preview.restrictionCounts.NOT_DELIVERABLE}
                </span>
                <span className="rounded-full bg-surface-muted border border-black/10 px-3 py-1 text-xs font-bold text-primary-muted">
                  Needs Review: {preview.restrictionCounts.NEEDS_REVIEW}
                </span>
              </div>
            </div>

            {/* Invariants safeguard note */}
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-primary">
              <p className="font-bold">Catalog Invariants Enforced:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-primary-muted">
                <li>
                  All newly imported items are created <strong>hidden</strong> (isActive: false).
                </li>
                <li>
                  Stock level is set to <strong>UNKNOWN</strong> with quantity 0 by default.
                </li>
                <li>
                  Uploaded file quantities or negative till figures are never assumed as live
                  inventory.
                </li>
                <li>Products must be manually published via Catalogue review.</li>
              </ul>
            </div>

            {/* Rejected rows list */}
            {preview.rejectedRows.length > 0 && (
              <div className="mt-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-danger">
                  Rejected Rows ({preview.rejectedRows.length})
                </h4>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-black/10 text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-surface-muted text-primary-muted">
                      <tr>
                        <th className="p-2">Row</th>
                        <th className="p-2">Code</th>
                        <th className="p-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {preview.rejectedRows.slice(0, 50).map((r, idx) => (
                        <tr key={idx} className="hover:bg-surface-muted/50">
                          <td className="p-2 font-mono">{r.sourceRow}</td>
                          <td className="p-2 font-mono text-danger">{r.code}</td>
                          <td className="p-2 text-primary">{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rejectedRows.length > 50 && (
                    <p className="p-2 text-center text-xs text-primary-muted bg-surface-muted">
                      Showing first 50 of {preview.rejectedRows.length} rejections.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Confirm & Apply Button */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-black/10 pt-4">
              <button
                type="button"
                onClick={handleReset}
                disabled={applying}
                className="rounded-2xl border border-black/10 px-5 py-2.5 text-sm font-bold text-primary hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={applying}
                className="inline-flex items-center gap-2 rounded-2xl bg-action px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {applying ? (
                  <>
                    <Icon name="loader-circle" className="h-4 w-4 animate-spin text-white" />
                    <span>Applying Changes...</span>
                  </>
                ) : (
                  <>
                    <Icon name="check" className="h-4 w-4" />
                    <span>Confirm & Apply Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2: Success Receipt */}
      {receipt && (
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-3 text-action">
            <IconMedallion icon="circle-check" size={32} decorative />
            <div>
              <h3 className="text-xl font-bold text-primary">Import Completed Successfully</h3>
              <p className="text-xs text-primary-muted">
                Department transactions executed and restriction audit entries logged.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-black/10 bg-surface-muted p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-primary-muted">
                Products Created
              </p>
              <p className="mt-1 text-2xl font-black text-primary">{receipt.productsCreated}</p>
            </div>
            <div className="rounded-xl border border-black/10 bg-surface-muted p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-primary-muted">
                Categories Created
              </p>
              <p className="mt-1 text-2xl font-black text-primary">{receipt.categoriesCreated}</p>
            </div>
            <div className="rounded-xl border border-black/10 bg-surface-muted p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-primary-muted">
                Existing Unchanged
              </p>
              <p className="mt-1 text-2xl font-black text-primary">{receipt.existingUnchanged}</p>
            </div>
            <div className="rounded-xl border border-black/10 bg-surface-muted p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-primary-muted">
                Restrictions Tightened
              </p>
              <p className="mt-1 text-2xl font-black text-primary">
                {receipt.restrictionTightened}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-2xl border border-black/10 px-5 py-2.5 text-sm font-bold text-primary hover:bg-surface-muted"
            >
              Upload another file
            </button>
            <Link
              href="/staff/products"
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              <Icon name="package" className="h-4 w-4" />
              <span>Review Catalogue Products</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
