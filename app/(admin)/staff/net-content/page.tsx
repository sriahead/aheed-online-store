import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Ruler } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getEnv } from "@/lib/config";
import { composePublicUrl } from "@/lib/storage";
import {
  listNetContentSummaryRowsForVendor,
  listPendingNetContentSuggestionsForVendor,
} from "@/lib/net-content-suggestions-service";
import { summariseNetContentPilot, type PilotSummary } from "@/lib/net-content-pilot-summary";
import { formatPrice } from "@/components/product/format-price";
import { deriveUnitPriceLabel, formatPackSize } from "@/components/product/unit-price";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import {
  NetContentReviewRow,
  type NetContentReviewRowData,
} from "@/components/staff/NetContentReviewRow";

// Reads the session and this vendor's suggestions — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Net content review" };

const EVIDENCE_TEXT = { PHOTO: "photo", NAME: "product name", UNIT_LABEL: "unit label" } as const;

function percent(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

/**
 * AI-suggested net content, reviewed by a person (#900).
 *
 * `scripts/suggest-net-content.ts` asks a model to read each product's pack size from its name,
 * unit label and any staff-sourced photo, and stores the answer here as a PENDING suggestion.
 * NOTHING reaches a product until someone on this page accepts or edits it — that is the whole
 * safety property, since a wrong net content shows shoppers a wrong price per kg or litre.
 */
export default async function StaffNetContentPage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store staff only"
        message="You're signed in, but your account doesn't have permission to review this store's net content."
      />
    );
  }

  const [pending, summaryRows] = await Promise.all([
    listPendingNetContentSuggestionsForVendor(auth.vendorId),
    listNetContentSummaryRowsForVendor(auth.vendorId),
  ]);
  const summary = summariseNetContentPilot(summaryRows);

  // Display strings are built here so the client row imports no storage or config module.
  const cdnBaseUrl = getEnv().CDN_BASE_URL ?? "";
  const rows: NetContentReviewRowData[] = pending.map((row) => {
    const netContent = { amount: row.amount, unit: row.unit };
    return {
      id: row.id,
      productId: row.product.id,
      productName: row.product.name,
      unitLabel: row.product.unitLabel,
      priceText: formatPrice(row.product.basePrice),
      amount: row.amount,
      unit: row.unit,
      packSizeText: formatPackSize(netContent),
      unitPriceText: deriveUnitPriceLabel(row.product.basePrice, netContent),
      confidence: row.confidence,
      evidenceSourceText: EVIDENCE_TEXT[row.evidenceSource],
      evidenceText: row.evidenceText,
      labelCheck: row.unitLabelCheck,
      photoUrl: row.productImage ? composePublicUrl(cdnBaseUrl, row.productImage.storageKey) : null,
    };
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Net content review</h1>
      <p className="mb-6 text-sm text-primary-muted">
        AI suggestions for each product&apos;s pack size. Nothing changes on a product until you
        accept or correct it here — shoppers&apos; price per kg or litre is worked out from this
        value, so check it against the packaging.
      </p>

      <PilotSummaryPanel summary={summary} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary-muted">
          Waiting for review ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
            <Ruler className="mx-auto mb-3 h-8 w-8 text-primary-subtle" aria-hidden />
            <p className="text-sm text-primary-muted">
              No suggestions waiting. New ones appear after the suggestion script is run.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id}>
                <NetContentReviewRow row={row} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function PilotSummaryPanel({ summary }: { summary: PilotSummary }) {
  const { byStatus, labelCheckAmongReviewed: checks } = summary;
  const figures: [string, string][] = [
    ["Suggestions", String(summary.total)],
    ["Waiting", String(byStatus.PENDING)],
    ["Accepted", String(byStatus.ACCEPTED)],
    ["Edited", String(byStatus.EDITED)],
    ["Rejected", String(byStatus.REJECTED)],
    ["No answer", String(byStatus.NO_ANSWER)],
    ["Acceptance rate", percent(summary.acceptanceRate)],
    ["No-answer share", percent(summary.noAnswerShare)],
    [
      "Label check (reviewed)",
      `${checks.AGREES} agree · ${checks.DISAGREES} disagree · ${checks.NOT_CHECKABLE} n/a`,
    ],
    [
      "Mean response time",
      summary.meanLatencyMs === null ? "n/a" : `${(summary.meanLatencyMs / 1000).toFixed(1)} s`,
    ],
    ["Tokens in / out", `${summary.totalInputTokens} / ${summary.totalOutputTokens}`],
    ["Models", summary.models.length === 0 ? "none yet" : summary.models.join(", ")],
  ];

  return (
    <section
      aria-labelledby="pilot-summary"
      className="mb-6 rounded-2xl border border-black/10 bg-white p-4"
    >
      <h2
        id="pilot-summary"
        className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary-muted"
      >
        Pilot summary
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {figures.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-primary-muted">{label}</dt>
            <dd className="text-right font-medium text-primary">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
