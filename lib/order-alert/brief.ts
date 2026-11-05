import type { AppEnvironment } from "../config";
import { withEnvironmentTag } from "../email/environment-tag";

/**
 * #1390 R5 — what an order alert says, and nothing more.
 *
 * The owner's 2026-11-01 rule: the order number, the sender's name and the subject. The store name
 * and the route are added because they are not customer data and a chat serving two stores could
 * not tell them apart otherwise. There is deliberately no field for the message body, an email
 * address or a phone number, so no caller can pass one to Telegram (or, later, Meta).
 *
 * Plain text, no markup: the Telegram adapter sends no `parse_mode`, so a subject cannot inject
 * formatting, and the same text later fits a WhatsApp utility-template body (#1424).
 */

export interface OrderAlertBrief {
  source: "email" | "contact-form";
  storeName: string;
  orderNumber: string | null;
  senderName: string | null;
  subject: string;
}

const SENDER_MAX = 100;
const SUBJECT_MAX = 200;

const VIA: Record<OrderAlertBrief["source"], string> = {
  email: "email",
  "contact-form": "contact form",
};

function senderLine(senderName: string | null): string {
  const name = (senderName ?? "").trim();
  return name === "" ? "unknown" : name.slice(0, SENDER_MAX);
}

function subjectLine(subject: string): string {
  const trimmed = subject.trim();
  if (trimmed === "") return "(no subject)";
  return trimmed.length > SUBJECT_MAX ? `${trimmed.slice(0, SUBJECT_MAX)}…` : trimmed;
}

export function formatOrderAlert(brief: OrderAlertBrief, environment: AppEnvironment): string {
  return [
    withEnvironmentTag(`Order inquiry: ${brief.storeName}`, environment),
    `Order: ${brief.orderNumber ?? "not given"}`,
    `From: ${senderLine(brief.senderName)}`,
    `Subject: ${subjectLine(brief.subject)}`,
    `Via: ${VIA[brief.source]}`,
  ].join("\n");
}
