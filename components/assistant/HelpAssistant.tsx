"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircle, X } from "lucide-react";
import {
  loadAssistantContent,
  recordAssistantOutcome,
  startAssistantConversation,
} from "@/features/assistant/assistant";
import type { AssistantEntry, AssistantPanelData } from "@/lib/assistant-content";
import { buildHandoffText, buildHandoffUrl, HANDOFF_NOTE } from "@/lib/assistant-handoff";

/**
 * The guided help assistant panel (#1015, #1014) — opened from `FloatingContact`.
 *
 * Guided only: the shopper picks a topic; nothing they type is collected. Content is fetched by
 * `loadAssistantContent` when the panel mounts, so the storefront render itself gains no query.
 *
 * ONE CONVERSATION PER OPEN PANEL. `FloatingContact` mounts this only while it is open, so every
 * open starts with fresh state and closing discards it — no reset logic to get wrong. The first
 * choice starts the conversation (one log row); showing an answer marks it ANSWERED once; tapping
 * the WhatsApp handoff marks it HANDED_OFF. If the log refuses or fails (`null`), the panel keeps
 * working and simply records nothing for this conversation.
 *
 * A HANDOFF, NOT A TRANSFER — and the panel says so next to the link.
 */

export function HelpAssistant({
  vendorName,
  onClose,
}: {
  vendorName: string;
  onClose: () => void;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [data, setData] = useState<AssistantPanelData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [entry, setEntry] = useState<AssistantEntry | null>(null);
  const [orderNumber, setOrderNumber] = useState("");

  // Per-conversation state. Refs, not state: they must not re-render, and a click handler must see
  // the latest value immediately.
  const conversation = useRef<Promise<string | null> | null>(null);
  const answered = useRef(false);
  const handedOff = useRef(false);

  useEffect(() => {
    headingRef.current?.focus();
    let cancelled = false;
    loadAssistantContent()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setStatus(result ? "ready" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape closes from anywhere while the panel is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function record(outcome: "ANSWERED" | "HANDED_OFF") {
    const pending = conversation.current;
    if (!pending) return;
    void pending
      .then((conversationId) =>
        conversationId ? recordAssistantOutcome({ conversationId, outcome }) : null,
      )
      .catch(() => null);
  }

  function choose(chosen: AssistantEntry) {
    if (!conversation.current) {
      conversation.current = startAssistantConversation(
        chosen.faqId ? { topic: chosen.topic, faqId: chosen.faqId } : { topic: chosen.topic },
      )
        .then((result) => result?.conversationId ?? null)
        .catch(() => null);
    }
    setEntry(chosen);
    if (chosen.answer && !answered.current) {
      answered.current = true;
      record("ANSWERED");
    }
  }

  function handOff() {
    if (handedOff.current) return;
    handedOff.current = true;
    record("HANDED_OFF");
  }

  const handoffHref =
    data && entry
      ? buildHandoffUrl(
          data.whatsappNumber,
          buildHandoffText({
            vendorName: data.vendorName,
            subject: entry.label,
            ...(orderNumber ? { orderNumber } : {}),
          }),
        )
      : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-end sm:justify-end sm:p-8">
      {/* Backdrop: a pointer convenience only. Keyboard users have Escape and the close button. */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-help-assistant=""
        className="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white text-primary shadow-[0_8px_30px_rgb(0,0,0,0.2)] sm:max-w-sm sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-black/10 px-4 py-3">
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="min-w-0 truncate text-base font-bold outline-none"
          >
            Help from {vendorName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help assistant"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-w-0 overflow-y-auto px-4 py-4 text-sm">
          {status === "loading" && <p className="text-primary-muted">Loading…</p>}
          {status === "unavailable" && (
            <p className="text-primary-muted">
              The help assistant is not available right now. The{" "}
              <Link href="/help" onClick={onClose} className="font-semibold underline">
                Help Centre
              </Link>{" "}
              has the same information.
            </p>
          )}

          {status === "ready" && data && !entry && (
            <div className="space-y-5">
              <p className="text-primary-muted">Pick a topic.</p>
              {data.sections.map((section) => (
                <section key={section.heading} className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-primary-muted">
                    {section.heading}
                  </h3>
                  <ul className="space-y-2">
                    {section.entries.map((item) => (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => choose(item)}
                          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-left font-medium break-words hover:border-action"
                        >
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {status === "ready" && data && entry && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setEntry(null)}
                className="inline-flex items-center gap-1 font-semibold text-action hover:underline"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to topics
              </button>
              <h3 className="font-bold break-words">{entry.label}</h3>

              {entry.answer?.map((paragraph, index) => (
                <p key={index} className="whitespace-pre-line break-words text-primary-muted">
                  {paragraph}
                </p>
              ))}
              {entry.links.map((link) => (
                <p key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onClose}
                    className="font-semibold text-action underline"
                  >
                    {link.label}
                  </Link>
                </p>
              ))}

              <div className="space-y-3 border-t border-black/10 pt-4">
                {entry.handoffPrompt ? (
                  <p className="text-primary-muted">{entry.handoffPrompt}</p>
                ) : (
                  <p className="text-primary-muted">Still need help? Message the store.</p>
                )}

                {data.orderNumbers.length > 0 && (
                  <label className="block">
                    <span className="mb-1 block font-semibold">Mention an order (optional)</span>
                    <select
                      value={orderNumber}
                      onChange={(event) => setOrderNumber(event.target.value)}
                      className="w-full rounded-lg border border-black/20 bg-white px-3 py-2"
                    >
                      <option value="">No order</option>
                      {data.orderNumbers.map((number) => (
                        <option key={number} value={number}>
                          {number}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {handoffHref && (
                  <a
                    href={handoffHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handOff}
                    className="flex items-center justify-center gap-2 rounded-xl bg-action px-4 py-3 font-semibold text-white hover:bg-action-hover"
                  >
                    <MessageCircle className="h-5 w-5" aria-hidden="true" />
                    Message the store on WhatsApp
                  </a>
                )}
                <p className="text-xs text-primary-muted">{HANDOFF_NOTE}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
