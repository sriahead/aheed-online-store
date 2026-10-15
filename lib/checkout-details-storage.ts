/**
 * The checkout form's remembered contact and delivery details, in `localStorage` (#1080).
 *
 * Kept out of `CheckoutForm` so the legacy-key migration can be tested without rendering the
 * form. The value is the form's JSON blob, unparsed: the form owns its shape. See
 * `lib/storage-keys.ts` for the compatibility window.
 */
import { CHECKOUT_DETAILS_KEY, LEGACY_CHECKOUT_DETAILS_KEY } from "./storage-keys";

/** The saved blob, new key first. A legacy blob is moved to the new key as it is read. */
export function readCheckoutDetails(storage: Storage): string | null {
  const current = storage.getItem(CHECKOUT_DETAILS_KEY);
  if (current !== null) return current;

  const legacy = storage.getItem(LEGACY_CHECKOUT_DETAILS_KEY);
  if (legacy === null) return null;
  storage.setItem(CHECKOUT_DETAILS_KEY, legacy);
  storage.removeItem(LEGACY_CHECKOUT_DETAILS_KEY);
  return legacy;
}

export function writeCheckoutDetails(storage: Storage, json: string): void {
  storage.setItem(CHECKOUT_DETAILS_KEY, json);
  storage.removeItem(LEGACY_CHECKOUT_DETAILS_KEY);
}
