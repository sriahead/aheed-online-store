"use client";

import { useActionState, useState } from "react";
import { replyToEnquiryAction, updateEnquiryStatusAction } from "./actions";

export interface EnquiryItem {
  id: string;
  source: string;
  type: string;
  senderName: string | null;
  senderEmail: string;
  senderPhone: string | null;
  toAddress: string | null;
  orderNumber: string | null;
  subject: string;
  message: string;
  status: string;
  replyBody: string | null;
  repliedAt: string | null;
  repliedBy: string | null;
  createdAt: string;
}

function ReplyBox({ enquiry, senderLabel }: { enquiry: EnquiryItem; senderLabel: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(replyToEnquiryAction, {});

  if (!open && !state.success) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-action px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
      >
        {enquiry.replyBody ? "Send Another Reply" : "Reply to Customer"}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 rounded-xl border border-black/10 bg-surface-muted p-4"
    >
      <input type="hidden" name="id" value={enquiry.id} />
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-primary-muted">
        <span>
          From: <strong className="text-primary">{senderLabel}</strong> → To:{" "}
          <strong className="text-primary">{enquiry.senderEmail}</strong>
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-medium text-primary-muted hover:text-primary"
        >
          Close
        </button>
      </div>
      <textarea
        name="replyBody"
        rows={4}
        required
        placeholder={`Write your reply to ${enquiry.senderName || enquiry.senderEmail}...`}
        className="w-full rounded-xl border border-black/20 bg-white p-3 text-sm text-primary focus:border-action focus:outline-none"
      />
      {state.error && <p className="mt-2 text-xs font-semibold text-danger">{state.error}</p>}
      {state.success && (
        <p className="mt-2 text-xs font-semibold text-action">
          Reply sent to {enquiry.senderEmail}.
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-action px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Sending..." : "Send Email Reply"}
        </button>
      </div>
    </form>
  );
}

export function EnquiryList({ items, senderLabel }: { items: EnquiryItem[]; senderLabel: string }) {
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "REPLIED" | "RESOLVED">("ALL");
  const [query, setQuery] = useState("");

  const filtered = items.filter((item) => {
    if (filter !== "ALL" && item.status !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.subject.toLowerCase().includes(q) ||
      item.message.toLowerCase().includes(q) ||
      item.senderEmail.toLowerCase().includes(q) ||
      (item.senderName ?? "").toLowerCase().includes(q) ||
      (item.orderNumber ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["ALL", "OPEN", "REPLIED", "RESOLVED"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors ${
                filter === tab
                  ? "bg-primary text-white"
                  : "bg-white text-primary-muted border border-black/10 hover:bg-black/5"
              }`}
            >
              {tab === "ALL" ? "All Messages" : tab}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by customer, email, order #, or subject..."
          className="w-full sm:w-80 rounded-xl border border-black/20 bg-white px-3.5 py-2 text-sm text-primary focus:border-action focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white p-10 text-center text-sm text-primary-muted">
          No customer enquiries match the current filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        item.status === "OPEN"
                          ? "bg-amber-100 text-amber-900"
                          : item.status === "REPLIED"
                            ? "bg-blue-100 text-blue-900"
                            : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      {item.status}
                    </span>
                    <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-semibold text-primary-muted">
                      {item.source === "INBOUND_EMAIL" ? "Inbound Email" : "Contact Form"} ·{" "}
                      {item.type}
                    </span>
                    {item.orderNumber && (
                      <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-900">
                        Order #{item.orderNumber}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-base font-bold text-primary">{item.subject}</h3>
                  <p className="mt-0.5 text-xs text-primary-muted">
                    From:{" "}
                    <strong className="text-primary">
                      {item.senderName
                        ? `${item.senderName} <${item.senderEmail}>`
                        : item.senderEmail}
                    </strong>
                    {item.senderPhone ? ` · Tel: ${item.senderPhone}` : ""}
                    {item.toAddress ? ` · To: ${item.toAddress}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-primary-muted">
                  <span>{new Date(item.createdAt).toLocaleString("en-GB")}</span>
                  <form action={updateEnquiryStatusAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={item.status === "RESOLVED" ? "OPEN" : "RESOLVED"}
                    />
                    <button
                      type="submit"
                      className="rounded-xl border border-black/15 px-3 py-1 text-xs font-semibold text-primary hover:bg-black/5"
                    >
                      {item.status === "RESOLVED" ? "Reopen" : "Mark Resolved"}
                    </button>
                  </form>
                </div>
              </div>

              <div className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-muted p-3.5 text-sm text-primary">
                {item.message}
              </div>

              {item.replyBody && (
                <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs text-primary">
                  <div className="mb-1 font-semibold text-blue-900">
                    Replied {item.repliedAt ? new Date(item.repliedAt).toLocaleString("en-GB") : ""}
                    {item.repliedBy ? ` by ${item.repliedBy}` : ""}:
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{item.replyBody}</div>
                </div>
              )}

              <div className="mt-3">
                <ReplyBox enquiry={item} senderLabel={senderLabel} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
