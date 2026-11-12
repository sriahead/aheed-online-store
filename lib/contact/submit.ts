import type { InboundDefaultForward } from "@/lib/config";
import type { EmailSendResult, OutgoingEmail } from "@/lib/email";
import type { ContactOutboxInput } from "@/lib/repositories/contact";
import type { OrderAlertBrief } from "@/lib/order-alert/brief";
import {
  initialContactState,
  parseContactFields,
  type ContactFormState,
} from "@/features/contact/validate-contact";
import { contactHtml, contactSubject } from "./message";
import { resolveContactRecipient, type RecipientAddress } from "./recipient";

/**
 * #1409 — what happens to one storefront contact-form submission, with every collaborator
 * injected so R13–R18 are tested without a request, a database or a provider.
 * `features/contact/submit-contact.ts` (the Server Action) only wires the live dependencies.
 *
 * The order is fixed (R14): honeypot, validation, rate limit, order ownership, recipient, send.
 * Only a submission that passes validation counts against the rate limit.
 *
 * #1390 R12, widened by #1548 — after the send (or the outbox enqueue), every successful submission
 * alerts the store's staff, its brief naming the contact type. Awaited, because a Worker may cancel an unawaited promise once
 * the response is sent; a failed alert is logged and never changes what the shopper sees.
 */

export interface ContactDeps {
  storeName: string;
  /** The signed-in shopper, or null for a guest. */
  userId: string | null;
  checkRateLimit(): Promise<{ allowed: boolean }>;
  /** The order's number when it is this shopper's order at this store, else null. */
  findOwnOrder(orderNumber: string, userId: string): Promise<string | null>;
  listAddresses(): Promise<RecipientAddress[]>;
  defaultForward: InboundDefaultForward;
  send(email: OutgoingEmail): Promise<EmailSendResult>;
  enqueue(row: ContactOutboxInput): Promise<void>;
  markPending(): Promise<void>;
  logError(message: string): void;
  /** #1390 — alert the store's staff. Expected never to reject, but guarded anyway. */
  alert(brief: OrderAlertBrief): Promise<void>;
  vendorId: string;
  now(): Date;
}

export const CONTACT_COPY = {
  rateLimited: "Too many messages. Please try again later.",
  orderNotFound: "That order could not be found.",
  noRecipient: "We could not send your message right now. Please try again later.",
} as const;

function failed(error: string): ContactFormState {
  return { ...initialContactState, status: "error", error };
}

function succeeded(replyTo: string): ContactFormState {
  return { ...initialContactState, status: "success", replyTo };
}

export async function processContactSubmission(
  fields: Record<string, string>,
  deps: ContactDeps,
): Promise<ContactFormState> {
  // Honeypot: a bot gets the ordinary success state and nothing happens.
  if ((fields.website ?? "") !== "") return succeeded(fields.email ?? "");

  const parsed = parseContactFields(fields);
  if (!parsed.ok) {
    return { ...initialContactState, status: "error", fieldErrors: parsed.fieldErrors };
  }
  const input = parsed.value;

  if (!(await deps.checkRateLimit()).allowed) return failed(CONTACT_COPY.rateLimited);

  let orderNumber: string | null = null;
  if (input.orderNumber !== "") {
    orderNumber = deps.userId ? await deps.findOwnOrder(input.orderNumber, deps.userId) : null;
    if (orderNumber === null) return failed(CONTACT_COPY.orderNotFound);
  }

  const recipient = resolveContactRecipient({
    type: input.type,
    hasOrder: orderNumber !== null,
    addresses: await deps.listAddresses(),
    defaultForward: deps.defaultForward,
  });
  if (recipient === null) {
    deps.logError(`contact form: no recipient configured for vendor ${deps.vendorId}`);
    return failed(CONTACT_COPY.noRecipient);
  }

  const message = {
    storeName: deps.storeName,
    type: input.type,
    name: input.name,
    email: input.email,
    phone: input.phone,
    orderNumber,
    subject: input.subject,
    message: input.message,
    submittedAt: deps.now(),
  };
  const subject = contactSubject(message);
  const html = contactHtml(message);

  const result = await deps.send({ to: recipient, subject, html, replyTo: input.email });
  if (result.status === "failed") {
    await deps.enqueue({
      toAddress: recipient,
      subject,
      html,
      replyTo: input.email,
      lastError: result.reason,
    });
    await deps.markPending();
  }

  try {
    await deps.alert({
      source: "contact-form",
      storeName: deps.storeName,
      orderNumber,
      senderName: input.name,
      subject: input.subject,
      contactType: input.type,
    });
  } catch {
    deps.logError(`contact form: order alert failed for vendor ${deps.vendorId}`);
  }
  return succeeded(input.email);
}
