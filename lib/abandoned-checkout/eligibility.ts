/**
 * #1554 — which abandoned checkouts the staff page lists, and whether one may be reminded. Pure and
 * import-free, so the page, the action and the tests share one rule.
 *
 * An abandoned checkout is an order the checkout-session expiry cancelled before payment: both the
 * Stripe webhook and the scheduled payment sweep write a CANCELLED status event whose note begins
 * `Checkout session expired`. A shopper who pressed Cancel, or whose payment failed, did not
 * abandon anything and is not listed.
 */

export const ABANDONED_NOTE_PREFIX = "Checkout session expired";

/** How far back the page lists. */
export const ABANDONED_LIST_DAYS = 30;

/** A reminder may go out only this soon after abandonment: a week-old basket reads as spam. */
export const REMINDER_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReminderBlock = "already-sent" | "guest" | "no-email" | "no-consent" | "too-old";

export const REMINDER_BLOCK_COPY: Record<ReminderBlock, string> = {
  "already-sent": "A reminder has already been sent for this checkout.",
  guest: "Guest checkout: there is no marketing consent to rely on.",
  "no-email": "There is no email address for this customer.",
  "no-consent":
    "This customer has not agreed to marketing emails, or has not verified their email address.",
  "too-old": `Reminders can only be sent within ${REMINDER_WINDOW_DAYS} days of the checkout expiring.`,
};

export interface ReminderCandidate {
  abandonedAt: Date;
  userId: string | null;
  email: string | null;
  /** `hasEffectiveMarketingConsent`: newest choice is a grant AND the email is verified. */
  hasConsent: boolean;
  reminderSentAt: Date | null;
}

/**
 * Null when a reminder may be sent now, else the first reason it may not. "Already sent" comes
 * first because it is the most useful thing to tell the admin.
 */
export function reminderBlock(row: ReminderCandidate, now: Date): ReminderBlock | null {
  if (row.reminderSentAt) return "already-sent";
  if (!row.userId) return "guest";
  if (!row.email) return "no-email";
  if (!row.hasConsent) return "no-consent";
  if (now.getTime() - row.abandonedAt.getTime() > REMINDER_WINDOW_DAYS * DAY_MS) return "too-old";
  return null;
}

export interface OfferableCode {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date | null;
  remainingRedemptions: number | null;
}

/** A discount code an admin may attach: active, started, not ended and not used up. */
export function isOfferableCode(code: OfferableCode, now: Date): boolean {
  return (
    code.isActive &&
    code.startsAt.getTime() <= now.getTime() &&
    (code.endsAt === null || code.endsAt.getTime() > now.getTime()) &&
    (code.remainingRedemptions === null || code.remainingRedemptions > 0)
  );
}
