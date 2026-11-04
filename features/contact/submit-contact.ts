"use server";

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getCurrentVendorId } from "@/lib/tenant";
import { submitContactForVendor } from "@/lib/contact-service";
import { readContactFields, type ContactFormState } from "./validate-contact";

/**
 * The storefront contact form's Server Action (#1409).
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE — not even a plain constant. It is enforced
 * at runtime, so a stray `export const` leaves `build`, `typecheck` and `test` green while the
 * action 500s for every caller. The form state, limits and parsing live in `./validate-contact.ts`.
 *
 * Open to guests. The session is read only to prove order ownership: an `orderId` from a guest,
 * or one naming someone else's order, is refused one layer down.
 */
export async function submitContact(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  const ip =
    requestHeaders.get("cf-connecting-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  return submitContactForVendor({
    vendorId: await getCurrentVendorId(),
    userId: session?.user?.id ?? null,
    ip,
    fields: readContactFields((key) => formData.get(key)),
  });
}
