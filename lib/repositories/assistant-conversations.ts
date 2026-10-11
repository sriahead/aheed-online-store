import type { AssistantOutcome, AssistantTopic } from "@prisma/client/wasm";
import type { getPrisma } from "@/lib/db";

/**
 * The help assistant's conversation log (#1014, built with #1015) — one row per conversation:
 * the shopper's first choice and how the conversation ended.
 *
 * Deliberately the shape of `lib/repositories/search-query-log.ts` (#565): vendor-scoped, a hashed
 * IP and no user link (#570 — see the `AssistantConversation` schema comment for why), a 90-day
 * retention sweep at low probability. The rate limit is `list-normalisation-rate-limit.ts`'s fixed
 * window, counted on this table itself rather than a separate attempts table, because one row per
 * conversation already IS the attempt.
 *
 * WHAT BEING REFUSED MEANS HERE. A refused `startConversation` returns `null` and the caller keeps
 * working: the shopper still gets every answer and the WhatsApp handoff, and only the log row is
 * skipped. That is what makes a limit affordable on a public, unauthenticated write — a false
 * positive (a household behind one NAT) costs a missing row, never a broken panel.
 *
 * Every write is a childless `create`, a singular `update` or a `deleteMany`, all safe over
 * `getPrisma()`'s HTTP adapter; no `updateMany`, so no websocket client (#382, CLAUDE.md).
 *
 * `prisma` and `vendorId` are explicit parameters (#409/#411) so
 * `scripts/verify-assistant-conversations.ts` can prove the limit, the sweep and the outcome rules
 * against a real database. `lib/assistant-service.ts` is the request-scoped entry point.
 */

type Db = ReturnType<typeof getPrisma>;

/** Fixed window: twenty conversations in ten minutes is generous for a person, useless for a script. */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_CONVERSATIONS_PER_WINDOW = 20;

const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const SWEEP_PROBABILITY = 0.01;

const OPENING_QUESTION_MAX = 200;

/**
 * The outcomes a row may move FROM to reach each outcome. HANDED_OFF is terminal, and nothing moves
 * back to ABANDONED — that is only ever the starting state.
 */
const ALLOWED_PREVIOUS: Record<AssistantOutcome, AssistantOutcome[]> = {
  ANSWERED: ["ABANDONED"],
  HANDED_OFF: ["ABANDONED", "ANSWERED"],
  ABANDONED: [],
};

/** SHA-256 of the caller's IP — this table never holds a raw address. */
async function hashIp(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Opens one conversation's row, outcome ABANDONED, unless this vendor has already logged
 * `MAX_CONVERSATIONS_PER_WINDOW` from the same hashed IP in the window — then nothing is written
 * and the result is `null`.
 *
 * `openingQuestion` must already be server-derived text (a fixed label or the vendor's own FAQ
 * question); this function trusts its caller on that, and only bounds the length.
 */
export async function startConversation(
  prisma: Db,
  vendorId: string,
  ip: string,
  topic: AssistantTopic,
  openingQuestion: string,
): Promise<{ id: string } | null> {
  const ipHash = await hashIp(ip);

  const recent = await prisma.assistantConversation.count({
    where: { vendorId, ipHash, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });
  if (recent >= MAX_CONVERSATIONS_PER_WINDOW) return null;

  const row = await prisma.assistantConversation.create({
    data: {
      vendorId,
      topic,
      openingQuestion: openingQuestion.slice(0, OPENING_QUESTION_MAX),
      ipHash,
    },
    select: { id: true },
  });

  if (Math.random() < SWEEP_PROBABILITY) {
    await prisma.assistantConversation.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  }

  return { id: row.id };
}

/**
 * Moves a conversation to `outcome` if that is an allowed transition from where it is now, and
 * returns whether a row changed.
 *
 * The id is never trusted on its own: the lookup carries `vendorId`, so another vendor's id (or an
 * unknown one) finds nothing and changes nothing. The update repeats the whole condition, so a
 * concurrent move that lands between the lookup and the update (say, the handoff tap racing the
 * answer) cannot be overwritten backwards; losing that race is reported as `false`.
 */
export async function recordOutcome(
  prisma: Db,
  vendorId: string,
  conversationId: string,
  outcome: AssistantOutcome,
): Promise<boolean> {
  const previous = ALLOWED_PREVIOUS[outcome] ?? [];
  if (previous.length === 0) return false;

  const where = { id: conversationId, vendorId, outcome: { in: previous } };
  const found = await prisma.assistantConversation.findFirst({ where, select: { id: true } });
  if (!found) return false;

  try {
    await prisma.assistantConversation.update({ where, data: { outcome } });
    return true;
  } catch {
    // The row moved between the lookup and the update — a lost race, not a failure.
    return false;
  }
}

export interface AssistantReport {
  /** Rows in the window. */
  total: number;
  byOutcome: Record<AssistantOutcome, number>;
  /** One entry per (topic, outcome) pair that has at least one row. */
  byTopic: { topic: AssistantTopic; outcome: AssistantOutcome; count: number }[];
  /** The opening questions most often handed off, most first, at most ten. */
  topHandedOff: { openingQuestion: string; count: number }[];
}

/** This vendor's conversations over the retention window ending at `now`, for /staff/assistant. */
export async function assistantReport(
  prisma: Db,
  vendorId: string,
  now: Date,
): Promise<AssistantReport> {
  const where = {
    vendorId,
    createdAt: { gte: new Date(now.getTime() - RETENTION_MS), lte: now },
  };

  const [pairs, handedOff] = await Promise.all([
    prisma.assistantConversation.groupBy({
      by: ["topic", "outcome"],
      where,
      _count: { _all: true },
    }),
    prisma.assistantConversation.groupBy({
      by: ["openingQuestion"],
      where: { ...where, outcome: "HANDED_OFF" },
      _count: { openingQuestion: true },
      orderBy: { _count: { openingQuestion: "desc" } },
      take: 10,
    }),
  ]);

  const byOutcome: Record<AssistantOutcome, number> = { ANSWERED: 0, HANDED_OFF: 0, ABANDONED: 0 };
  const byTopic = pairs.map((pair) => {
    byOutcome[pair.outcome] += pair._count._all;
    return { topic: pair.topic, outcome: pair.outcome, count: pair._count._all };
  });

  return {
    total: byOutcome.ANSWERED + byOutcome.HANDED_OFF + byOutcome.ABANDONED,
    byOutcome,
    byTopic,
    topHandedOff: handedOff.map((row) => ({
      openingQuestion: row.openingQuestion,
      count: row._count.openingQuestion,
    })),
  };
}

/** Exported for the verification script and the staff page's own wording. */
export const ASSISTANT_RETENTION_DAYS = RETENTION_DAYS;
export const ASSISTANT_MAX_CONVERSATIONS_PER_WINDOW = MAX_CONVERSATIONS_PER_WINDOW;
export const ASSISTANT_WINDOW_MS = WINDOW_MS;
