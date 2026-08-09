import { cookies } from "next/headers";
import { getAuth } from "./auth";
import { headers } from "next/headers";

/**
 * Cart identity for the current request (P3a, #93).
 *
 * A signed-in shopper is identified by userId; a guest by an opaque token in the
 * `aheed_cart` cookie. The cookie is HttpOnly/Secure/SameSite=Lax and
 * deliberately HOST-ONLY (no Domain attribute) — mirroring slice 3c's isolation
 * posture, so a cart cookie can never be read across vendor hosts even before
 * the DB's vendorId scoping is consulted.
 *
 * Nothing here creates state: the cookie is only issued on the first actual add
 * (issueGuestToken), so merely browsing — including by a crawler on this public,
 * indexed storefront — writes neither a cookie nor a Cart row.
 */

export const CART_COOKIE = "aheed_cart";

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
  return { userId, guestToken: jar.get(CART_COOKIE)?.value ?? null };
}

/**
 * Returns the existing guest token, or issues (and sets) a new one. Call only
 * from a mutation that is actually about to create a cart — see the no-state-on-
 * browse rule above.
 */
export async function issueGuestToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  if (existing) return existing;

  const token = crypto.randomUUID();
  jar.set(CART_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    // No `domain` — host-only by design (see the module comment).
  });
  return token;
}

/** Cleared only as part of an applied merge resolution, never speculatively. */
export async function clearGuestToken(): Promise<void> {
  (await cookies()).delete(CART_COOKIE);
}
