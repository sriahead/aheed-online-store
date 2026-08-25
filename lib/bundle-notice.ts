/**
 * The "some of this bundle wasn't available" notice (P8.5c, #347) — pure, shared
 * by the action that writes it and the cart page that renders it.
 *
 * THIS LIVES IN A PLAIN MODULE, NOT IN `features/cart/add-bundle-to-cart.ts`,
 * because that file is `"use server"` and such a file may export ONLY async
 * functions. A same-file constant — even one used purely for convenience by a
 * caller — makes EVERY action in the file 500 at runtime while `next build`,
 * `tsc` and `vitest` all stay green (CLAUDE.md's Server Actions section, the
 * P6b1/#159 trap).
 */

/**
 * Product names travel in a query parameter rather than a flash cookie: the
 * notice then survives the redirect with no new state to store or expire, and a
 * headless check can read it straight off the response body.
 */
export const UNAVAILABLE_SEPARATOR = "|";

/** Split the query parameter back into names, dropping empties. */
export function parseUnavailableNames(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(UNAVAILABLE_SEPARATOR)
    .map((name) => name.trim())
    .filter((name) => name !== "");
}
