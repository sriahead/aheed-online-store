import { getPrisma } from "@/lib/db";
import { getInboundDefaultForward } from "@/lib/config";
import { getEmailService, type EmailService } from "@/lib/email";
import { clearContactOutboxPending, markContactOutboxPending } from "@/lib/job-signals";
import {
  checkContactRateLimit,
  countContactOutbox,
  deleteContactOutboxRow,
  insertContactOutbox,
  listContactOutbox,
  recordContactOutboxFailure,
  type ContactOutboxRow,
} from "@/lib/repositories/contact";
import { listInboundAddresses } from "@/lib/repositories/inbound-address";
import { createVendorEnquiry } from "@/lib/repositories/enquiries";
import { listAllVendorIds } from "@/lib/repositories/vendor";
import { findOrderForUser, listOrdersForUser } from "@/lib/repositories/orders";
import { fetchVendorProfile } from "@/lib/vendor-service";
import { processContactSubmission } from "@/lib/contact/submit";
import { sendOrderAlertForVendor } from "@/lib/order-alert-service";
import { fallbackBrand } from "@/lib/email/layout/fallback";
import {
  loadVendorNotificationContext,
  sendVendorNotifications,
} from "@/lib/order-notifications-service";
import { parseContactFields, type ContactFormState } from "@/features/contact/validate-contact";

/**
 * #1409 — the request-scoped half of the storefront contact form, plus the outbox retry job.
 * `app/` and `features/` may not import `@/lib/db`, so the live Prisma client is resolved here and
 * handed to the repository, whose functions take it explicitly.
 */

/** The shopper's recent orders at this store, for the form's optional order picker (R12). */
export async function listContactOrderOptions(
  vendorId: string,
  userId: string,
): Promise<{ orderNumber: string; createdAt: Date }[]> {
  const page = await listOrdersForUser(getPrisma(), vendorId, userId, { take: 20 });
  return page.items.map((o) => ({ orderNumber: o.orderNumber, createdAt: o.createdAt }));
}

export async function submitContactForVendor(input: {
  vendorId: string;
  userId: string | null;
  ip: string;
  fields: Record<string, string>;
}): Promise<ContactFormState> {
  const prisma = getPrisma();
  const { vendorId } = input;
  const profile = await fetchVendorProfile(vendorId);
  const state = await processContactSubmission(input.fields, {
    vendorId,
    storeName: profile.name,
    userId: input.userId,
    checkRateLimit: () => checkContactRateLimit(prisma, vendorId, input.ip),
    findOwnOrder: async (orderNumber, userId) =>
      (await findOrderForUser(prisma, vendorId, orderNumber, userId))?.orderNumber ?? null,
    listAddresses: () => listInboundAddresses(prisma, vendorId),
    defaultForward: getInboundDefaultForward(),
    send: (email) => getEmailService().send(email),
    enqueue: (row) => insertContactOutbox(prisma, vendorId, row),
    markPending: () => markContactOutboxPending(),
    logError: (message) => console.error(message),
    alert: async (brief) => {
      await sendOrderAlertForVendor(vendorId, brief);
    },
    loadBrand: async () =>
      (await loadVendorNotificationContext(vendorId)).brand ?? fallbackBrand(profile.name),
    acknowledge: async ({ to, subject, html, text }) => {
      await sendVendorNotifications(vendorId, [
        {
          channel: "EMAIL",
          destination: to,
          subject,
          body: html,
          text,
          sender: { name: profile.senderName, email: profile.senderEmail },
          log: { audience: "CUSTOMER", event: "CONTACT_ACKNOWLEDGEMENT" },
        },
      ]);
    },
    now: () => new Date(),
  });

  if (state.status === "success" && (input.fields.website ?? "") === "") {
    const parsed = parseContactFields(input.fields);
    if (parsed.ok) {
      try {
        await createVendorEnquiry(prisma, vendorId, {
          source: "CONTACT_FORM",
          type: parsed.value.type,
          senderName: parsed.value.name,
          senderEmail: parsed.value.email,
          senderPhone: parsed.value.phone || null,
          orderNumber: parsed.value.orderNumber || null,
          subject: parsed.value.subject,
          message: parsed.value.message,
        });
      } catch (err) {
        console.error(`contact form: failed to record enquiry for vendor ${vendorId}`, err);
      }
    }
  }

  return state;
}

export const CONTACT_OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const CONTACT_OUTBOX_BATCH = 50;

export interface ContactOutboxSummary {
  sent: number;
  failed: number;
  expired: number;
  remaining: number;
}

/** What the retry job needs, injectable so R21 is tested without a database or provider. */
export interface ContactOutboxDeps {
  listVendorIds(): Promise<string[]>;
  list(vendorId: string, take: number): Promise<ContactOutboxRow[]>;
  remove(vendorId: string, id: string): Promise<void>;
  recordFailure(vendorId: string, id: string, attempts: number, lastError: string): Promise<void>;
  count(vendorId: string): Promise<number>;
  email: EmailService;
  mark(): Promise<void>;
  clear(): Promise<void>;
  now(): Date;
}

/**
 * R21 — retries up to 50 queued emails, oldest first within each store. A row older than 7 days
 * is deleted unsent and logged by id and store only, so no shopper's address or message reaches a
 * log line. `skipped` counts as done: retrying would not change it.
 */
export async function runContactOutbox(deps: ContactOutboxDeps): Promise<ContactOutboxSummary> {
  const summary = { sent: 0, failed: 0, expired: 0, remaining: 0 };
  let budget = CONTACT_OUTBOX_BATCH;
  const cutoff = deps.now().getTime() - CONTACT_OUTBOX_MAX_AGE_MS;

  const vendorIds = await deps.listVendorIds();
  for (const vendorId of vendorIds) {
    if (budget <= 0) break;
    const rows = await deps.list(vendorId, budget);
    budget -= rows.length;
    for (const row of rows) {
      if (row.createdAt.getTime() < cutoff) {
        await deps.remove(vendorId, row.id);
        console.error(
          `contact outbox: expired unsent after 7 days (id ${row.id}, vendor ${vendorId})`,
        );
        summary.expired += 1;
        continue;
      }
      const result = await deps.email.send({
        to: row.toAddress,
        subject: row.subject,
        html: row.html,
        replyTo: row.replyTo,
      });
      if (result.status === "failed") {
        await deps.recordFailure(vendorId, row.id, row.attempts + 1, result.reason);
        summary.failed += 1;
      } else {
        await deps.remove(vendorId, row.id);
        summary.sent += 1;
      }
    }
  }

  // Per store, so every query stays vendor-scoped (tests/repository-vendor-scoping.test.ts).
  for (const vendorId of vendorIds) summary.remaining += await deps.count(vendorId);
  if (summary.remaining === 0) await deps.clear();
  else await deps.mark();
  return summary;
}

export function getContactOutboxService() {
  const prisma = getPrisma();
  return {
    run: () =>
      runContactOutbox({
        listVendorIds: () => listAllVendorIds(prisma),
        list: (vendorId, take) => listContactOutbox(prisma, vendorId, take),
        remove: (vendorId, id) => deleteContactOutboxRow(prisma, vendorId, id),
        recordFailure: (vendorId, id, attempts, lastError) =>
          recordContactOutboxFailure(prisma, vendorId, id, attempts, lastError),
        count: (vendorId) => countContactOutbox(prisma, vendorId),
        email: getEmailService(),
        mark: markContactOutboxPending,
        clear: clearContactOutboxPending,
        now: () => new Date(),
      }),
  };
}
