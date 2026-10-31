"use client";

/** #1309 - "Save as PDF" is the browser's own print dialog; no PDF library is involved. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 print:hidden"
    >
      {label}
    </button>
  );
}
