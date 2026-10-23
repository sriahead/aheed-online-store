"use client";

import { useRef, useState } from "react";
import { HelpAssistant } from "@/components/assistant/HelpAssistant";
import { buildHandoffUrl } from "@/lib/assistant-handoff";
import { Icon } from "@/components/icons/Icon";

/**
 * The Help Centre's "still need help?" card (#1052).
 *
 * With the help assistant available (`assistantEnabled` and a WhatsApp number — the same rule as
 * `FloatingContact`), it opens the assistant, which hands off to WhatsApp itself (#1051). With the
 * assistant off, it links straight to the store's WhatsApp. With neither, it renders nothing: no
 * contact route is invented for a store that has not configured one (#239).
 *
 * The assistant is mounted only while open, as in `FloatingContact`, so every open is a fresh
 * conversation (#1014); closing it returns focus to this card's button.
 */
export function HelpContactCard({
  vendorName,
  whatsappNumber,
  assistantAvailable,
}: {
  vendorName: string;
  whatsappNumber: string | null;
  assistantAvailable: boolean;
}) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  if (!whatsappNumber) return null;

  function closeAssistant() {
    setAssistantOpen(false);
    trigger.current?.focus();
  }

  const buttonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-action px-5 py-3 font-semibold text-white hover:bg-action-hover";

  return (
    <section className="bg-white rounded-2xl p-6 border border-black/10">
      <div className="flex items-center gap-3 mb-2">
        <Icon name="message-circle" className="w-5 h-5 text-action-tint" />
        <h2 className="font-bold text-lg">Still need help?</h2>
      </div>
      {assistantAvailable ? (
        <>
          <p className="mb-4 text-sm text-black/70">
            Our help assistant answers common questions straight away, and can pass you to{" "}
            {vendorName} on WhatsApp for anything else.
          </p>
          <button
            ref={trigger}
            type="button"
            onClick={() => setAssistantOpen(true)}
            aria-haspopup="dialog"
            className={buttonClass}
          >
            Open the help assistant
          </button>
          {assistantOpen && <HelpAssistant vendorName={vendorName} onClose={closeAssistant} />}
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-black/70">Message {vendorName} on WhatsApp.</p>
          <a
            href={buildHandoffUrl(
              whatsappNumber,
              `Hi ${vendorName}, I have a question about my order.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass}
          >
            <Icon name="message-circle" className="h-5 w-5" />
            Message {vendorName} on WhatsApp
          </a>
        </>
      )}
    </section>
  );
}
