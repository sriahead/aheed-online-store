"use client";

import { useActionState } from "react";
import { formatPrice } from "@/components/product/format-price";
import type { AbandonedCheckoutView } from "@/lib/abandoned-checkouts-service";
import { sendReminderAction } from "./actions";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

function ReminderCell({
  row,
  codes,
}: {
  row: AbandonedCheckoutView;
  codes: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(sendReminderAction, {});

  if (row.reminder) {
    return (
      <p className="text-xs text-primary-muted">
        Sent {when(row.reminder.sentAt)}
        {row.reminder.sentByName ? ` by ${row.reminder.sentByName}` : ""}
        {row.reminder.discountCode ? ` with code ${row.reminder.discountCode}` : ""}
      </p>
    );
  }
  if (state.success) {
    return <p className="text-xs font-semibold text-action">Reminder sent.</p>;
  }
  if (row.blockedReason) {
    return <p className="text-xs text-primary-muted">{row.blockedReason}</p>;
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="orderNumber" value={row.orderNumber} />
      <label className="sr-only" htmlFor={`code-${row.orderNumber}`}>
        Discount code
      </label>
      <select
        id={`code-${row.orderNumber}`}
        name="discountCodeId"
        defaultValue=""
        className="rounded-xl border border-black/20 bg-white px-2 py-1.5 text-xs text-primary"
      >
        <option value="">No discount code</option>
        {codes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-action px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send reminder"}
      </button>
      {state.error && <p className="w-full text-xs font-semibold text-danger">{state.error}</p>}
    </form>
  );
}

export function AbandonedCheckoutList({
  rows,
  codes,
}: {
  rows: AbandonedCheckoutView[];
  codes: { id: string; label: string }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-10 text-center text-sm text-primary-muted">
        No abandoned checkouts in this period.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.orderNumber}
          className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-sm">
              <p className="font-semibold text-primary">{row.orderNumber}</p>
              <p className="text-xs text-primary-muted">
                Expired {when(row.abandonedAt)} ·{" "}
                {row.isGuest ? "Guest" : (row.customerName ?? "Customer")} ·{" "}
                {row.isGuest ? "no consent" : row.hasConsent ? "opted in" : "not opted in"}
              </p>
            </div>
            <p className="text-sm text-primary">
              {row.itemCount} {row.itemCount === 1 ? "item" : "items"} ·{" "}
              <strong>{formatPrice(row.totalPence)}</strong>
            </p>
          </div>
          <div className="mt-3">
            <ReminderCell row={row} codes={codes} />
          </div>
        </div>
      ))}
    </div>
  );
}
