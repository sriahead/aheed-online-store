"use client";

import { useState, useTransition } from "react";
import {
  refreshCostsAction,
  refreshRecommendationsAction,
} from "@/app/(admin)/staff/platform/costs/actions";
import { refreshCsv } from "@/lib/pricing/csv";
import { formatMoney, gbp, type Money } from "@/lib/pricing/money";
import { STATUS_TEXT, type DiffRow, type RefreshResult } from "@/lib/pricing/refresh";

/**
 * #1309 - the Review panel on /staff/platform/costs. Runs a refresh and shows the result as
 * UNCONFIRMED suggestions, held only in this tab: nothing is saved, and nothing here feeds a total
 * or a scenario table (those are server-rendered from the committed registries).
 */

type Action = typeof refreshCostsAction;

function value(v: Money | number | null): string {
  if (v === null) return "none";
  return typeof v === "number" ? String(v) : formatMoney(v);
}

function target(row: DiffRow): string {
  switch (row.target.kind) {
    case "competitor-plan":
      return `${row.target.competitorId}: ${row.target.planName}`;
    case "cost-item":
      return `${row.target.itemId}: ${row.target.planName}`;
    case "new":
      return `New plan: ${row.target.planName}`;
  }
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function reference(v: { marginPence: number | null; shopPaysPence: number }): string {
  const margin =
    v.marginPence === null ? "margin unavailable" : `margin ${formatMoney(gbp(v.marginPence))}`;
  return `${margin}, shop pays ${formatMoney(gbp(v.shopPaysPence))}`;
}

export function PricingReviewPanel({ lastAnalysis }: { lastAnalysis: string }) {
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<"costs" | "all" | null>(null);
  const [, startTransition] = useTransition();

  function run(scope: "costs" | "all", action: Action) {
    setRunning(scope);
    setError(null);
    startTransition(async () => {
      const response = await action();
      if (response.ok) setResult(response.result);
      else setError(response.error);
      setRunning(null);
    });
  }

  function download() {
    if (!result) return;
    const blob = new Blob([refreshCsv(result.sources, result.ranAt)], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `suggestions-${result.ranAt.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const changes = result?.sources.flatMap((s) => s.rows.filter((r) => r.change !== "same")) ?? [];

  return (
    <div
      data-costs="review-panel"
      className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm print:hidden"
    >
      <p className="text-sm text-slate-700">
        Last analysis: <strong>{lastAnalysis}</strong>
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Suggestions are not saved. Accept one by updating the registry in a pull request.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={running !== null}
          onClick={() => run("costs", refreshCostsAction)}
          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {running === "costs" ? "Refreshing…" : "Refresh Costs"}
        </button>
        <button
          type="button"
          disabled={running !== null}
          onClick={() => run("all", refreshRecommendationsAction)}
          className="rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {running === "all" ? "Refreshing…" : "Refresh Recommendations"}
        </button>
        {result && (
          <button
            type="button"
            onClick={download}
            className="rounded-xl border border-black/10 px-4 py-2 text-xs font-bold text-slate-700"
          >
            Download suggestions (CSV)
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm font-bold text-rose-700">{error}</p>}

      {result && (
        <div data-costs="refresh-result" className="mt-4 space-y-4 text-sm text-slate-700">
          <p className="text-xs text-slate-500">Run at {result.ranAt}</p>
          <ul className="space-y-1">
            {result.sources.map((s) => (
              <li key={s.sourceUrl} data-refresh-source={s.status}>
                {host(s.sourceUrl)}: {STATUS_TEXT[s.status]}
              </li>
            ))}
          </ul>

          {changes.length > 0 ? (
            <ul className="space-y-1">
              {changes.map((row, i) => (
                <li
                  key={`${row.sourceUrl}-${target(row)}-${row.field}-${i}`}
                  data-refresh-row={row.change}
                >
                  <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">
                    Unconfirmed suggestion
                  </span>
                  {target(row)} {row.field}: {value(row.committed)} → {value(row.suggested)} (
                  {row.change})
                </li>
              ))}
            </ul>
          ) : (
            <p>No differences from the committed figures in the pages that were read.</p>
          )}

          {result.recommendations && (
            <div data-costs="refresh-recommendations" className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">
                If these suggestions were accepted
              </h3>
              {result.recommendations.deltas.models.length === 0 ? (
                <p>No reference-scenario figure would change.</p>
              ) : (
                <ul>
                  {result.recommendations.deltas.models.map((d) => (
                    <li key={d.modelId}>
                      {d.modelId}: {reference(d.committed)} → {reference(d.ifAccepted)}
                    </li>
                  ))}
                </ul>
              )}
              <p>
                Recommendation check{" "}
                {result.recommendations.deltas.recommendationDisagreesChanged
                  ? "would change"
                  : "unchanged"}
                .
              </p>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">
                Recommended actions
              </h3>
              <ul className="list-disc pl-5">
                {result.recommendations.actions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
