/**
 * Pure referral rules & helpers (Loyalty & Rewards integration).
 *
 * Random customer referral codes (#987), URL construction, self-referral
 * detection, and share link generators. No I/O, no DB access — unit-testable
 * without network or database.
 */

import { formatPrice } from "@/components/product/format-price";

export const REFERRAL_DISCOUNT_PENCE = 500; // £5.00 off for referred friend
export const REFERRAL_REWARD_POINTS = 100; // 100 points reward for referrer
export const MIN_REFERRAL_ORDER_PENCE = 2000; // £20.00 minimum order

/**
 * #987 — the 32 characters a referral code is drawn from: A–Z and 2–9 without `0`, `1`, `O` and
 * `I`, so a code read aloud or retyped is not ambiguous. 32 is a power of two, so `byte & 31` picks
 * every character with equal probability (no modulo bias).
 */
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 8;

/**
 * #987 — a fresh random referral code, `REF-` plus 8 characters from `REFERRAL_CODE_ALPHABET`.
 *
 * Random and STORED, never derived from the user id (owner choice at Gate 1, 2026-10-06). The old
 * derivation kept only the first 8 characters of the id, so two users could derive the same code,
 * and a code was predictable from its owner's id. A shopper's code is now looked up by its owner
 * (`DiscountCode.referrerUserId`); uniqueness is settled by the database, which is why
 * `getOrCreateReferralCode` retries on a collision rather than this function trying to avoid one.
 *
 * `fillRandom` exists for tests; production always uses `crypto.getRandomValues`.
 */
export function generateRandomReferralCode(
  fillRandom: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = fillRandom(new Uint8Array(REFERRAL_CODE_LENGTH));
  let suffix = "";
  for (const byte of bytes) suffix += REFERRAL_CODE_ALPHABET[byte & 31];
  return `REF-${suffix}`;
}

/**
 * Extract user ID prefix from a referral code, or null if invalid format.
 */
export function extractReferralPrefix(code: string): string | null {
  if (!code || typeof code !== "string") return null;
  const trimmed = code.trim().toUpperCase();
  const match = /^REF-([A-Z0-9]{4,16})$/.exec(trimmed);
  return match ? match[1] : null;
}

/**
 * Check if a referral attempt is a self-referral.
 * Self-referrals are refused to protect reward integrity.
 */
export function isSelfReferral(
  referrerUserId: string | null,
  currentUserId: string | null,
): boolean {
  if (!referrerUserId || !currentUserId) return false;
  return referrerUserId === currentUserId;
}

/**
 * #987 — who earns the referral bonus for a confirmed order, or null for nobody. The owner is the
 * redeemed code's `referrerUserId` foreign key (null for staff codes, and for a referral code whose
 * owner was erased); a shopper never earns a bonus from their own order. `confirmPayment` calls this
 * for exactly that decision, so it can be tested without a transaction.
 */
export function referralBonusRecipient(
  referrerUserId: string | null | undefined,
  orderUserId: string | null,
): string | null {
  if (!referrerUserId) return null;
  return isSelfReferral(referrerUserId, orderUserId) ? null : referrerUserId;
}

/**
 * Build the customer's referral URL.
 */
export function buildReferralUrl(baseUrl: string, referralCode: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("ref", referralCode);
    return url.toString();
  } catch {
    // If baseUrl is a relative path or fails URL parse
    const cleanBase = baseUrl.replace(/\/$/, "");
    return `${cleanBase}/?ref=${encodeURIComponent(referralCode)}`;
  }
}

export interface ShareLinks {
  facebook: string;
  twitter: string;
  email: string;
  whatsapp: string;
}

/**
 * Construct social share URLs for referral link.
 *
 * #729 — `storeName` is required: it used to default to one vendor's name, so any caller that
 * forgot it advertised that vendor on every other vendor's storefront.
 */
export function buildShareLinks(
  referralUrl: string,
  storeName: string,
  // #907 — required, from the same value the card and the discount code use, so a share message
  // can never promise a different amount from the one the friend actually gets.
  discountOffPence: number,
): ShareLinks {
  const discount = formatPrice(discountOffPence);
  const shareMessage = `Join me on ${storeName}! Use my invite link to get ${discount} off your first order:`;
  const emailSubject = `Special invitation to shop at ${storeName}`;
  const emailBody = `Hi,\n\nI thought you would like ${storeName}. Use my personal referral link to get ${discount} off your first order:\n\n${referralUrl}\n\nHappy shopping!`;

  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralUrl)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(shareMessage)}`,
    email: `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareMessage} ${referralUrl}`)}`,
  };
}
