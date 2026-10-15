import { cookies } from "next/headers";
import { getAuth } from "./auth";
import { headers } from "next/headers";
import { CART_COOKIE, LEGACY_CART_COOKIE, readCookieWithFallback } from "./storage-keys";

/**
 * Cart identity for the current request (P3a, #93).
 *
 * A signed-in shopper is identified by userId; a guest by an opaque token in the
 * `store_cart` cookie (`CART_COOKIE`). The cookie is HttpOnly/Secure/SameSite=Lax and
 * deliberately HOST-ONLY (no Domain attribute) — mirroring slice 3c's isolation
 * posture, so a cart cookie can never be read across vendor hosts even before
 * the DB's vendorId scoping is consulted.
 *
 * #1080 renamed the cookie to a vendor-neutral name. For the compatibility window
 * (`lib/storage-keys.ts`), reads fall back to the legacy name and the next cart
 * mutation moves the same token across, so a guest keeps their basket.
 *
 * Nothing here creates state: the cookie is only issued on the first actual add
 * (issueGuestToken), so merely browsing — including by a crawler on this public,
 * indexed storefront — writes neither a cookie nor a Cart row.
 */

export { CART_COOKIE };

export interface CartIdentity {
  userId: string | null;
  guestToken: string | null;
}

/** Reads the signed-in user id, or null for a guest. */
export async function getUserId(): Promise<string | null> {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

/** The request's identity as-is — no cookie is issued and no row is created. */
export async function getCartIdentity(): Promise<CartIdentity> {
  const [userId, jar] = await Promise.all([getUserId(), cookies()]);
  return { userId, guestToken: readCookieWithFallback(jar, CART_COOKIE, LEGACY_CART_COOKIE) };
}

const GUEST_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
  // No `domain` — host-only by design (see the module comment).
} as const;

/**
 * Returns the existing guest token, or issues (and sets) a new one. Call only
 * from a mutation that is actually about to create a cart — see the no-state-on-
 * browse rule above.
 */
export async function issueGuestToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  if (existing) return existing;

  // #1080 — a legacy cookie carries the SAME token under the new name, so the guest's Cart row
  // (looked up by token) is untouched. Done here rather than on read because a cookie can only be
  // set from a server action or route handler, never during a server-component render.
  const legacy = jar.get(LEGACY_CART_COOKIE)?.value;
  const token = legacy ?? crypto.randomUUID();
  jar.set(CART_COOKIE, token, GUEST_TOKEN_COOKIE_OPTIONS);
  if (legacy) jar.delete(LEGACY_CART_COOKIE);
  return token;
}

/** Cleared only as part of an applied merge resolution, never speculatively. */
export async function clearGuestToken(): Promise<void> {
  const jar = await cookies();
  jar.delete(CART_COOKIE);
  jar.delete(LEGACY_CART_COOKIE);
}
