"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/components/product/format-price";
import {
  applyImportChunkAction,
  decideImportLineAction,
  replanImportAction,
  searchImportProductsAction,
  undoImportAction,
} from "@/features/admin/stock-import";
import {
  DECISION_LABELS,
  readyToApply,
  REVIEW_GROUPS,
  reviewGroup,
  type ReviewGroup,
} from "@/lib/stock-import/review";
import type { ReviewLine, ReviewProduct, ReviewRun } from "./types";

/**
 * #1578 R4–R8 — the review screen: every line of an uploaded file, grouped; a decision per line;
 * Apply in chunks with progress; Refresh plan after a settings change; Undo.
 */

const card = "rounded-3xl border border-black/10 bg-white p-4";
const small =
  "rounded-2xl border border-black/10 bg-white px-3 py-1.5 text-sm font-semibold text-primary hover:bg-surface-muted disabled:opacity-60";
const primary =
  "rounded-2xl bg-action px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60";

function ProductLine({ label, p }: { label: string; p: ReviewProduct }) {
  return (
    <p className="text-sm text-primary">
      <span className="text-primary-muted">{label}: </span>
      <span className="font-semibold">{p.name}</span>
      {p.plu ? ` · PLU ${p.plu}` : ""} · {formatPrice(p.basePrice)}
      {p.size ? ` · ${p.size}` : ""} ·{" "}
      <span className={p.isActive ? "font-bold text-danger" : "text-primary-muted"}>
        {p.isActive ? "LIVE" : "hidden"}
      </span>
    </p>
  );
}

function DecisionForm({
  runId,
  line,
  onSaved,
}: {
  runId: string;
  line: ReviewLine;
  onSaved: () => void;
}) {
  const initialChoice =
    line.decision === "UPDATE" || line.decision === "CREATE" || line.decision === "SKIP"
      ? line.decision
      : "";
  const [choice, setChoice] = useState<string>(initialChoice);
  const [target, setTarget] = useState<ReviewProduct | null>(line.target);
  const [note, setNote] = useState(line.note);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ReviewProduct[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = [line.target, line.runnerUp].filter((p): p is ReviewProduct => !!p);

  async function search() {
    setError(null);
    const rows = await searchImportProductsAction({ query });
    setFound(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        plu: r.plu,
        basePrice: r.basePrice,
        size:
          r.netContentAmount && r.netContentUnit
            ? `${r.netContentAmount} ${r.netContentUnit.toLowerCase()}`
            : null,
        isActive: r.isActive,
      })),
    );
  }

  async function save() {
    if (!choice) {
      setError("Choose what to do with this line.");
      return;
    }
    if (choice === "UPDATE" && !target) {
      setError("Choose the product to update.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await decideImportLineAction({
      runId,
      lineId: line.id,
      decision: choice as "UPDATE" | "CREATE" | "SKIP",
      targetProductId: choice === "UPDATE" ? (target?.id ?? null) : null,
      note,
    });
    setBusy(false);
    if (!result.ok) setError(result.error);
    else onSaved();
  }

  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-surface-muted p-3">
      <div className="flex flex-wrap gap-3 text-sm text-primary">
        {(["UPDATE", "CREATE", "SKIP"] as const).map((d) => (
          <label key={d}>
            <input
              type="radio"
              name={`d-${line.id}`}
              checked={choice === d}
              onChange={() => setChoice(d)}
            />{" "}
            {d === "UPDATE" ? "Update a product" : d === "CREATE" ? "Create new (hidden)" : "Skip"}
          </label>
        ))}
      </div>
      {choice === "UPDATE" && (
        <div className="space-y-1">
          {suggestions.map((p) => (
            <label key={p.id} className="block text-sm text-primary">
              <input
                type="radio"
                name={`t-${line.id}`}
                checked={target?.id === p.id}
                onChange={() => setTarget(p)}
              />{" "}
              {p.name} {p.plu ? `(PLU ${p.plu})` : ""} · {formatPrice(p.basePrice)}
            </label>
          ))}
          {target && !suggestions.some((p) => p.id === target.id) && (
            <p className="text-sm text-primary">Chosen: {target.name}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-2xl border border-black/10 bg-white px-3 py-1.5 text-sm"
              placeholder="Find another product by name, PLU or barcode"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className={small}
              onClick={search}
              disabled={query.trim().length < 2}
            >
              Search
            </button>
          </div>
          {found && (
            <ul className="max-h-48 overflow-y-auto text-sm">
              {found.length === 0 && <li className="text-primary-muted">No products found.</li>}
              {found.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="text-left text-action underline"
                    onClick={() => setTarget(p)}
                  >
                    {p.name} {p.plu ? `(PLU ${p.plu})` : ""} · {formatPrice(p.basePrice)}{" "}
                    {p.isActive ? "· LIVE" : ""}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <input
        className="w-full rounded-2xl border border-black/10 bg-white px-3 py-1.5 text-sm"
        placeholder="Note (optional)"
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button type="button" className={small} onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save decision"}
        </button>
        {error && (
          <span role="alert" className="text-sm font-semibold text-danger">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function LineCard({
  runId,
  line,
  onChanged,
}: {
  runId: string;
  line: ReviewLine;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const group = reviewGroup(line);
  const open = line.status === "OPEN" || line.status === "FAILED";
  return (
    <li className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-primary">
            {line.cleanName}
            {line.pricePence !== null ? ` · ${formatPrice(line.pricePence)}` : ""}
          </p>
          <p className="text-xs text-primary-muted">
            Row {line.rowNumber}: “{line.sourceText}” · {line.categoryName}
          </p>
        </div>
        <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-bold text-primary">
          {group === "applied"
            ? line.status === "UNDONE"
              ? "Undone"
              : `Applied: ${(line.result ?? "").toLowerCase()}`
            : group === "failed"
              ? "Failed"
              : (DECISION_LABELS[line.decision] ?? line.decision)}
        </span>
      </div>
      {line.question && open && (
        <p className="mt-2 rounded-2xl bg-action-tint/50 px-3 py-2 text-sm font-semibold text-primary">
          Question: {line.question}
        </p>
      )}
      <div className="mt-2 space-y-0.5">
        {line.target && (
          <ProductLine
            label={line.decision === "UPDATE" ? "Updates" : "Closest in your shop"}
            p={line.target}
          />
        )}
        {line.runnerUp && <ProductLine label="Also close" p={line.runnerUp} />}
        {line.otherSizes && (
          <p className="text-sm text-primary-muted">Other sizes in your shop: {line.otherSizes}</p>
        )}
        {line.reason && <p className="text-xs text-primary-muted">Why: {line.reason}</p>}
        {line.tillWords && (
          <p className="text-xs text-primary-muted">Kept from your till name: {line.tillWords}</p>
        )}
        {line.issues && <p className="text-xs text-danger">{line.issues}</p>}
        {line.changeSummary && open && (
          <pre className="whitespace-pre-wrap text-xs text-primary">{line.changeSummary}</pre>
        )}
        {line.note && <p className="text-xs text-primary-muted">Note: {line.note}</p>}
        {line.resultDetail && !open && <p className="text-xs text-primary">{line.resultDetail}</p>}
        {line.resultDetail && line.status === "FAILED" && (
          <p className="text-xs font-semibold text-danger">{line.resultDetail}</p>
        )}
        {line.decidedBy && (
          <p className="text-xs text-primary-muted">Decided by {line.decidedBy}</p>
        )}
      </div>
      {open && !editing && (
        <button type="button" className={`${small} mt-2`} onClick={() => setEditing(true)}>
          {group === "decide" ? "Decide" : "Change"}
        </button>
      )}
      {open && editing && (
        <DecisionForm
          runId={runId}
          line={line}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </li>
  );
}

export function StockImportReview({ run }: { run: ReviewRun }) {
  const router = useRouter();
  const [tab, setTab] = useState<ReviewGroup | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<ReviewGroup, ReviewLine[]>();
    for (const l of run.lines) {
      const g = reviewGroup(l);
      map.set(g, [...(map.get(g) ?? []), l]);
    }
    return map;
  }, [run.lines]);
  const active = tab ?? REVIEW_GROUPS.find((g) => groups.get(g.id)?.length)?.id ?? "decide";
  const ready = readyToApply(run.lines);
  const isOpen = run.status === "OPEN";
  const anyApplied = run.lines.some((l) => l.status === "APPLIED");
  const refresh = () => router.refresh();

  async function apply() {
    setWorking(true);
    setError(null);
    let first = true;
    let applied = 0;
    let failed = 0;
    try {
      for (;;) {
        const r = await applyImportChunkAction({ runId: run.id, first });
        first = false;
        if (!r.ok) {
          setError(r.error);
          break;
        }
        applied += r.applied;
        failed += r.failed;
        setProgress(
          `Applied ${applied} line${applied === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}; ${r.remaining} to go…`,
        );
        if (r.remaining === 0 || r.applied + r.failed === 0) break;
      }
      setProgress(
        `Done: ${applied} applied${failed ? `, ${failed} failed (see Failed)` : ""}. New products are hidden until you switch them on in Products.`,
      );
    } catch {
      setError(
        "The apply stopped part-way. Press Apply again to carry on; nothing is applied twice.",
      );
    }
    setWorking(false);
    refresh();
  }

  async function replan() {
    setWorking(true);
    setError(null);
    const r = await replanImportAction({ runId: run.id });
    setWorking(false);
    if (!r.ok) setError(r.error);
    else
      setProgress(
        "Plan refreshed with the current settings and catalogue. Your decisions were kept.",
      );
    refresh();
  }

  async function undo() {
    setWorking(true);
    setError(null);
    const r = await undoImportAction({ runId: run.id });
    setWorking(false);
    if (!r.ok) setError(r.error);
    else
      setProgress(
        `Undone: ${r.result.deleted} new product${r.result.deleted === 1 ? "" : "s"} removed, ${r.result.restoredProducts} product${r.result.restoredProducts === 1 ? "" : "s"} put back.` +
          (r.result.kept.length
            ? ` Kept: ${r.result.kept.map((k) => `${k.name} (${k.reason})`).join("; ")}.`
            : ""),
      );
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          {isOpen && (
            <button
              type="button"
              className={primary}
              onClick={apply}
              disabled={working || ready === 0 || run.settingsChanged}
            >
              Apply {ready} decided line{ready === 1 ? "" : "s"}
            </button>
          )}
          {isOpen && (
            <button type="button" className={small} onClick={replan} disabled={working}>
              Refresh plan
            </button>
          )}
          {isOpen && anyApplied && <UndoButton disabled={working} onConfirm={undo} />}
          {!isOpen && (
            <span className="text-sm font-semibold text-primary-muted">
              This import was undone.
            </span>
          )}
        </div>
        {run.settingsChanged && isOpen && (
          <p className="text-sm font-semibold text-danger">
            The import settings changed after this file was checked. Press Refresh plan before
            applying.
          </p>
        )}
        <p className="text-xs text-primary-muted">
          Apply writes only lines decided as Update or Create. New products are created hidden with
          stock unknown; live products keep their price. Lines that need a decision wait until you
          decide.
        </p>
        {progress && (
          <p role="status" className="text-sm font-semibold text-action">
            {progress}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {REVIEW_GROUPS.map((g) => {
          const n = groups.get(g.id)?.length ?? 0;
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={active === g.id}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${active === g.id ? "bg-action text-white" : "bg-white text-primary border border-black/10"}`}
              onClick={() => setTab(g.id)}
            >
              {g.label} ({n})
            </button>
          );
        })}
      </div>

      <ul className="space-y-3">
        {(groups.get(active) ?? []).map((line) => (
          <LineCard key={line.id} runId={run.id} line={line} onChanged={refresh} />
        ))}
        {(groups.get(active) ?? []).length === 0 && (
          <li className="text-sm text-primary-muted">Nothing here.</li>
        )}
      </ul>
    </div>
  );
}

function UndoButton({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className={small} disabled={disabled} onClick={() => setAsking(true)}>
        Undo this import
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-primary">
      Remove the products this import created and put changed fields back?
      <button
        type="button"
        className={small}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Yes, undo
      </button>
      <button type="button" className={small} onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}
