/**
 * Pure referral rules & helpers (Loyalty & Rewards integration).
 *
 * Deterministic customer referral codes, URL construction, self-referral
 * detection, and share link generators. No I/O, no DB access — unit-testable
 * without network or database.
 */

export const REFERRAL_DISCOUNT_PENCE = 500; // £5.00 off for referred friend
export const REFERRAL_REWARD_POINTS = 100; // 100 points reward for referrer
export const MIN_REFERRAL_ORDER_PENCE = 2000; // £20.00 minimum order

/**
 * Generate a deterministic, human-readable referral code from a user ID.
 * Example: `REF-A1B2C3D4`
 */
export function generateReferralCode(userId: string): string {
  if (!userId || typeof userId !== "string") return "REF-AHEED";
  // Clean non-alphanumeric chars, take 8 chars uppercase
  const cleaned = userId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const slice = cleaned.padEnd(8, "0").slice(0, 8);
  return `REF-${slice}`;
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
 * Check if a code matches the user's own referral code.
 */
export function isUsersOwnReferralCode(code: string, currentUserId: string | null): boolean {
  if (!code || !currentUserId) return false;
  const userCode = generateReferralCode(currentUserId);
  return code.trim().toUpperCase() === userCode.toUpperCase();
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
 */
export function buildShareLinks(referralUrl: string, storeName = "Aheed Food Centre"): ShareLinks {
  const shareMessage = `Join me on ${storeName}! Use my invite link to get £5 off your first grocery order:`;
  const emailSubject = `Special invitation to shop at ${storeName}`;
  const emailBody = `Hi,\n\nI thought you would like ${storeName}. Use my personal referral link to get £5 off your first grocery order:\n\n${referralUrl}\n\nHappy shopping!`;

  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralUrl)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(shareMessage)}`,
    email: `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareMessage} ${referralUrl}`)}`,
  };
}
