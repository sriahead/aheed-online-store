import type { getPrisma } from "@/lib/db";
import { ATTEMPT_RECORD_RETENTION_HOURS } from "@/lib/data-retention";
import { hashIp } from "@/lib/repositories/customer-feedback-rate-limit";

/**
 * #1409 — the storefront contact form's two tables: the rate-limit counter (`ContactAttempt`) and
 * the failed-send outbox (`ContactOutbox`).
 *
 * Every export takes its Prisma client and, where it touches one store's rows, that store's
 * `vendorId` explicitly (tests/repository-client-injection.test.ts); request-scoped entry points
 * live in `lib/contact-service.ts`. Only singular `create`/`update` and `delete`/`deleteMany` are
 * used, all safe on the HTTP adapter — no `updateMany`/`createMany` (#382).
 */

type Db = ReturnType<typeof getPrisma>;

const WINDOW_MS = 60 * 60_000;
const MAX_SUBMISSIONS_PER_WINDOW = 5;
const RETENTION_MS = ATTEMPT_RECORD_RETENTION_HOURS * 60 * 60 * 1000;
const SWEEP_PROBABILITY = 0.01;

export const CONTACT_RATE_LIMIT = {
  windowMs: WINDOW_MS,
  maxSubmissionsPerWindow: MAX_SUBMISSIONS_PER_WINDOW,
} as const;

/**
 * Counts this store's submissions from the caller's hashed IP in the last hour and, when under the
 * limit, records this one. The retention sweep must outlive the window, which the shared 1-hour
 * attempt retention does exactly.
 */
export async function checkContactRateLimit(
  prisma: Db,
  vendorId: string,
  ip: string,
): Promise<{ allowed: boolean }> {
  const ipHash = await hashIp(ip);
  const since = new Date(Date.now() - WINDOW_MS);

  const count = await prisma.contactAttempt.count({
    where: { vendorId, ipHash, createdAt: { gte: since } },
  });
  if (count >= MAX_SUBMISSIONS_PER_WINDOW) return { allowed: false };

  await prisma.contactAttempt.create({ data: { vendorId, ipHash } });

  if (Math.random() < SWEEP_PROBABILITY) {
    await prisma.contactAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  }
  return { allowed: true };
}

export interface ContactOutboxInput {
  toAddress: string;
  subject: string;
  html: string;
  replyTo: string;
  lastError: string;
}

export interface ContactOutboxRow extends ContactOutboxInput {
  id: string;
  vendorId: string;
  attempts: number;
  createdAt: Date;
}

export async function insertContactOutbox(
  prisma: Db,
  vendorId: string,
  input: ContactOutboxInput,
): Promise<void> {
  await prisma.contactOutbox.create({ data: { vendorId, ...input } });
}

/** One store's queued rows, oldest first. */
export async function listContactOutbox(
  prisma: Db,
  vendorId: string,
  take: number,
): Promise<ContactOutboxRow[]> {
  const rows = await prisma.contactOutbox.findMany({
    where: { vendorId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
  });
  return rows.map((r) => ({ ...r, lastError: r.lastError ?? "" }));
}

export async function deleteContactOutboxRow(
  prisma: Db,
  vendorId: string,
  id: string,
): Promise<void> {
  await prisma.contactOutbox.deleteMany({ where: { id, vendorId } });
}

export async function recordContactOutboxFailure(
  prisma: Db,
  vendorId: string,
  id: string,
  attempts: number,
  lastError: string,
): Promise<void> {
  await prisma.contactOutbox.update({
    where: { id, vendorId },
    data: { attempts, lastError },
  });
}

export async function countContactOutbox(prisma: Db, vendorId: string): Promise<number> {
  return prisma.contactOutbox.count({ where: { vendorId } });
}
