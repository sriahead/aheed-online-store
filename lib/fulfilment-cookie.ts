/**
 * Fulfilment-method cookie name and input parsing (#748).
 *
 * Pure and DB-free, and deliberately NOT inside `features/storefront/delivery.ts`
 * — that file is `"use server"`, where every export must be an async function
 * (CLAUDE.md's Server Actions section, the P6b1/#159 trap). `Header`, `/cart` and
 * `/checkout` all need the cookie name to READ the value, so the constant has to
 * live somewhere a Server Component can import without pulling in the action
 * module. Exactly the same split as `lib/delivery-cookie.ts`, which this file
 * sits beside on purpose.
 *
 * The RULE for which method actually applies — reconciling this stored preference
 * against what the vendor offers — lives in `lib/fulfilment-service.ts`, because
 * it needs the vendor. This module only decides what a raw cookie string is worth
 * reading.
 */

/** Mirrors Prisma's `FulfilmentMethod` enum; duplicated as a literal union so this stays DB-free. */
export type FulfilmentMethodChoice = "DELIVERY" | "COLLECTION";

export const FULFILMENT_METHOD_COOKIE = "fulfilment-method";

/**
 * The stored choice, or `null` when there is nothing usable there.
 *
 * `null` is meaningful and is NOT the same as `"DELIVERY"`: it means the shopper
 * has never chosen, which `lib/fulfilment-service.ts` resolves differently (see
 * `defaultFulfilmentMethod`). Collapsing the two here would silently change the
 * default for every shopper who has not touched the toggle.
 *
 * Anything unrecognised is `null` rather than a throw — a cookie is attacker-
 * editable, and a junk value must degrade to "no preference", not to an error
 * page on every route that reads it.
 */
export function parseFulfilmentMethod(
  raw: string | null | undefined,
): FulfilmentMethodChoice | null {
  if (raw === "DELIVERY" || raw === "COLLECTION") return raw;
  return null;
}

/**
 * What applies when the shopper has expressed no preference — deliberately the
 * same rule `LocationControl` computed locally before #748 moved it here, so a
 * shopper who has never chosen lands exactly where they landed before.
 *
 * A vendor that does not offer collection is always DELIVERY; that case is
 * handled by the caller in `lib/fulfilment-service.ts`, which knows the vendor.
 */
export function defaultFulfilmentMethod(
  hasDeliverablePostcode: boolean,
  offerCollection: boolean,
): FulfilmentMethodChoice {
  if (hasDeliverablePostcode) return "DELIVERY";
  return offerCollection ? "COLLECTION" : "DELIVERY";
}
