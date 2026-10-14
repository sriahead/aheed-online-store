"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

/**
 * Delivery-postcode preference (P8.5f).
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE (CLAUDE.md's Server Actions
 * section — the P6b1/#159 trap: one value export makes every action in the file
 * 500 at runtime, and `next build`/`tsc`/`vitest` all stay green). The cookie
 * name is needed by `Header` to READ the value, so it lives in
 * `lib/delivery-cookie.ts` rather than here.
 *
 * ## Why a cookie and not a query string
 *
 * The checker used to be a `method="GET"` form inside the homepage hero, so the
 * answer lived in `/?postcode=…` and vanished the moment a shopper clicked a
 * product. In the header it has to survive navigation, and the header is a Server
 * Component rendered by the layout — so a cookie is the only carrier that (a)
 * every route can read server-side and (b) needs no client JS at all.
 *
 * ## What is stored
 *
 * The postcode ONLY — never the deliverable/not verdict. That is derived at
 * render time by `isDeliverable()` against the current vendor's prefixes, so a
 * vendor extending their delivery area doesn't leave shoppers holding a stale
 * "we don't deliver to you". One source of truth, recomputed per request.
 *
 * Consent: this is a functional store preference, inside the essential set
 * `components/consent/CookieBanner.tsx` already describes ("cart, authentication,
 * and store preferences"), and it is written only in response to a deliberate
 * submission — never on browse.
 */

import {
  DELIVERY_POSTCODE_COOKIE,
  POSTCODE_INTENT_FIELD,
  normalisePostcodeInput,
  parsePostcodeIntent,
} from "@/lib/delivery-cookie";
import { isPostcodeDeliverable } from "@/lib/delivery-eligibility-service";
import { recordRefusalForPostcode } from "@/lib/delivery-refusals-service";
import { FULFILMENT_METHOD_COOKIE, parseFulfilmentMethod } from "@/lib/fulfilment-cookie";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/**
 * Store (or clear) the shopper's postcode. Bound directly to a `<form action>`,
 * so it works with JavaScript disabled.
 *
 * An empty submission clears it — that is the "forget my postcode" affordance,
 * and it costs no extra control on a header that is deliberately sparse.
 *
 * ## It sets the fulfilment method, but only on delivery intent (#1087)
 *
 * This used to set the method NEVER, which read as `#748`'s rule but was wider
 * than that rule needed to be. The consequence: once the method cookie held
 * `COLLECTION`, entering a postcode could not select Delivery, so a shopper who
 * clicked **Delivery**, was asked for a postcode, and gave a deliverable one
 * stayed on Click & Collect — with their own postcode invisible, because the
 * control only showed it under `DELIVERY`.
 *
 * `#748`'s actual rule is narrower, and `LocationControl` already encodes it in
 * which control opens this modal: the Delivery affordance means "deliver this",
 * the pencil means "I live somewhere else now". So the method follows the
 * submitted intent, and the pencil path behaves exactly as it did before.
 *
 * Deliverability costs no extra query: `getDeliveryEligibility` is wrapped in
 * React `cache()` and `recordRefusalForPostcode` below resolves the same
 * postcode in the same request, so this is a cache hit either way. The cookie
 * still stores the postcode ONLY — the verdict stays derived per request, for
 * the reason in this file's header.
 */
export async function setDeliveryPostcode(formData: FormData): Promise<void> {
  const submitted = normalisePostcodeInput(String(formData.get("postcode") ?? ""));
  const intent = parsePostcodeIntent(
    formData.get(POSTCODE_INTENT_FIELD) as string | null | undefined,
  );
  const jar = await cookies();

  if (submitted === "") {
    jar.delete(DELIVERY_POSTCODE_COOKIE);
  } else {
    // Attributes mirror lib/cart-identity.ts's guest-token cookie exactly,
    // including the absent `domain` (host-only by design).
    jar.set(DELIVERY_POSTCODE_COOKIE, submitted, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS_SECONDS,
    });

    // Only a deliverable postcode selects Delivery. An undeliverable one leaves
    // the stored preference alone rather than selecting a method the shopper
    // cannot complete — the same reasoning as the control that renders an
    // "ask for a postcode" button instead of a Delivery toggle.
    if (intent === "delivery" && (await isPostcodeDeliverable(submitted))) {
      jar.set(FULFILMENT_METHOD_COOKIE, "DELIVERY", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: THIRTY_DAYS_SECONDS,
      });
    }
  }

  // #889 — a real postcode this store does not serve is counted, by district and day only. The
  // helper swallows its own failures, so the cookie and re-render below never depend on it.
  await recordRefusalForPostcode(submitted, "HEADER");

  // The Header lives in the storefront LAYOUT, not a page, so the layout is what
  // has to re-render for the badge to change — on whichever route the form was
  // submitted from.
  revalidatePath("/", "layout");
}

/**
 * Store the shopper's Delivery / Click & Collect choice (#748).
 *
 * ## Why this is a cookie and not client state
 *
 * Before this, the method was four independent `useState` values — two
 * `LocationControl` instances (desktop and mobile), `CheckoutForm` and
 * `CheckoutSummary` — stitched together by a `window` CustomEvent and a
 * `localStorage` blob. Nothing server-rendered could read any of it, so the cart
 * drawer and `/cart` were structurally unable to know the method, and the
 * header's own two instances could disagree with each other.
 *
 * The postcode beside it solved the identical problem the identical way, and for
 * the same reason: the surfaces that need this are Server Components rendered by
 * the layout, so a cookie is the only carrier that every route can read
 * server-side with no client JS at all.
 *
 * `httpOnly` because nothing in the browser reads it — every surface that renders
 * from this value is server-rendered. Attributes otherwise mirror the postcode
 * cookie above exactly, including the absent `domain` (host-only by design).
 *
 * Consent: a functional store preference, inside the essential set
 * `components/consent/CookieBanner.tsx` already describes, written only in
 * response to a deliberate submission.
 */
export async function setFulfilmentMethod(formData: FormData): Promise<void> {
  const submitted = parseFulfilmentMethod(String(formData.get("fulfilmentMethod") ?? ""));

  // An unrecognised value leaves the existing preference alone rather than
  // clearing it. A cookie-setting action reachable from a plain form is also
  // reachable from a crafted one, and silently discarding a shopper's real
  // choice because someone posted junk is a worse outcome than ignoring the post.
  if (submitted === null) return;

  const jar = await cookies();
  jar.set(FULFILMENT_METHOD_COOKIE, submitted, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  });

  revalidatePath("/", "layout");
}
