"use client";

import { useActionState } from "react";
import Link from "next/link";
import { reviewNetContent } from "@/features/admin/net-content-suggestions";
import { initialNetContentReviewState } from "@/lib/net-content-review-form";
import {
  NET_CONTENT_UNITS,
  NET_CONTENT_UNIT_LABELS,
  type NetContentUnit,
} from "@/components/product/unit-price";

/**
 * One AI net-content suggestion awaiting a person's decision (#900, R18-R21).
 *
 * Every display string is computed by the server page and passed in: this client component
 * imports no storage, config or Prisma module. ONE real `<form>` with three `name="intent"`
 * buttons, the same shape as the search dictionary's rows, so it posts with JS off and can be
 * driven with curl.
 */

export interface NetContentReviewRowData {
  id: string;
  productId: string;
  productName: string;
  unitLabel: string;
  priceText: string;
  amount: number;
  unit: NetContentUnit;
  packSizeText: string;
  unitPriceText: string | null;
  confidence: number;
  evidenceSourceText: string;
  evidenceText: string;
  labelCheck: "AGREES" | "DISAGREES" | "NOT_CHECKABLE" | null;
  photoUrl: string | null;
}

const LABEL_CHECK_TEXT: Record<NonNullable<NetContentReviewRowData["labelCheck"]>, string> = {
  AGREES: "Matches the unit label's price",
  DISAGREES: "Does NOT match the unit label's price",
  NOT_CHECKABLE: "Unit label can't be checked",
};

const LABEL_CHECK_STYLE: Record<NonNullable<NetContentReviewRowData["labelCheck"]>, string> = {
  AGREES: "bg-action-tint text-primary",
  DISAGREES: "bg-danger-tint text-danger",
  NOT_CHECKABLE: "bg-surface-muted text-primary-muted",
};

export function NetContentReviewRow({ row }: { row: NetContentReviewRowData }) {
  const [state, action, pending] = useActionState(reviewNetContent, initialNetContentReviewState);

  return (
    <form action={action} className="rounded-2xl border border-black/10 bg-white p-4">
      <input type="hidden" name="id" value={row.id} />

      <div className="flex gap-4">
        {row.photoUrl && (
          <img
            src={row.photoUrl}
            alt={`Packaging of ${row.productName}, read as evidence`}
            className="h-20 w-20 shrink-0 rounded-lg border border-black/10 object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/staff/products/${row.productId}`}
            className="font-semibold text-primary hover:underline"
          >
            {row.productName}
          </Link>
          <p className="text-sm text-primary-muted">
            {row.priceText} · unit label: {row.unitLabel}
          </p>

          <p className="mt-2 text-lg font-semibold text-primary">
            Suggested: {row.packSizeText}
            {row.unitPriceText && (
              <span className="ml-2 text-sm font-normal text-primary-muted">
                (shoppers would see {row.unitPriceText})
              </span>
            )}
          </p>
          <p className="text-sm text-primary-muted">
            Confidence {row.confidence}% · from the {row.evidenceSourceText}: &ldquo;
            {row.evidenceText}&rdquo;
          </p>
          {row.labelCheck && (
            <span
              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${LABEL_CHECK_STYLE[row.labelCheck]}`}
            >
              {LABEL_CHECK_TEXT[row.labelCheck]}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-primary">Amount</span>
          <input
            name="netContentAmount"
            type="number"
            min={1}
            step={1}
            defaultValue={row.amount}
            className="w-28 rounded-lg border border-black/15 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-primary">Unit</span>
          <select
            name="netContentUnit"
            defaultValue={row.unit}
            className="rounded-lg border border-black/15 px-3 py-2"
          >
            {NET_CONTENT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {NET_CONTENT_UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="intent"
            value="accept"
            disabled={pending}
            className="rounded-full bg-action px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Accept suggestion
          </button>
          <button
            type="submit"
            name="intent"
            value="edit"
            disabled={pending}
            className="rounded-full border border-primary/30 bg-white px-4 py-2 text-sm font-semibold text-primary disabled:opacity-60"
          >
            Save edited value
          </button>
          <button
            type="submit"
            name="intent"
            value="reject"
            disabled={pending}
            className="rounded-full bg-surface-muted px-4 py-2 text-sm font-semibold text-primary-muted disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="mt-2 text-sm text-primary-muted">
          {state.notice}
        </p>
      )}
    </form>
  );
}
