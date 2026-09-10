# Social & contact surface — Facebook, Instagram and WhatsApp deep link (requirements / acceptance criteria)

Closes `#407` (Facebook and Instagram links, per-vendor and data-driven) and the floating-button
half of `#405`; `#405`'s chat half stays open as `#695`. Three nullable `VendorConfig` columns carry
each vendor's own Facebook URL, Instagram URL and WhatsApp number; a `null` hides that element
rather than falling back to a platform default, per `#239`. Reads project through
`fetchVendorProfile` onto `VendorProfile`; writes go through `/staff/storefront` with pure,
DB-free validation that accepts **https URLs only**, because these are the first vendor-editable
values in this repo that land inside an `href`. See `plan.md` for the reasoning.

R1. `prisma/schema.prisma`'s `VendorConfig` model declares exactly three new optional columns —
    `facebookUrl String?`, `instagramUrl String?`, `whatsappNumber String?` — and a single new
    directory under `prisma/migrations/` contains the `ALTER TABLE` adding all three as nullable
    columns, with no `DROP` statement anywhere in that file.

R2. `lib/repositories/vendor.ts`'s `VendorProfile` interface declares `facebookUrl: string | null`,
    `instagramUrl: string | null` and `whatsappNumber: string | null`, and `fetchVendorProfile`
    both selects all three in its `config.select` block and returns each defaulting to `null`
    (no platform fallback value of any kind).

R3. A new pure module `lib/social-contact-form.ts` exports a parser for social URLs and a parser
    for the WhatsApp number, contains no import of `@/lib/db`, `next/headers`, `@/lib/auth`,
    `@/lib/auth-rbac` or `@/lib/tenant`, and returns errors as values rather than throwing —
    matching `lib/delivery-rules-form.ts`.

R4. The URL parser in `lib/social-contact-form.ts` accepts a value whose scheme is `https:` and
    rejects every other scheme, with `javascript:`, `data:`, `file:` and `http:` each rejected;
    a blank/whitespace-only value parses successfully to `null` (meaning "not set") rather than
    being reported as an error.

R5. The WhatsApp parser accepts a digits-only value of 7 to 15 digits, rejects any value containing
    a non-digit character (including `+`, spaces and hyphens), and parses a blank/whitespace-only
    value successfully to `null`.

R6. `components/layout/StorefrontChrome.tsx`'s footer renders a Facebook link when
    `profile.facebookUrl` is non-null and an Instagram link when `profile.instagramUrl` is non-null;
    each rendered link carries `target="_blank"`, `rel` containing both `noopener` and `noreferrer`,
    and an accessible name containing both the vendor's name and the network name (for example
    `Aheed Food Centre on Instagram`) rather than being an unlabelled icon.

R7. `components/layout/StorefrontChrome.tsx` renders a link to `https://wa.me/<whatsappNumber>`
    carrying a prefilled `text` query parameter when `profile.whatsappNumber` is non-null, and
    renders no such element when it is null. That link carries `target="_blank"`, `rel` containing
    both `noopener` and `noreferrer`, and an accessible name containing the vendor's name and
    identifying it as WhatsApp.

R8. The WhatsApp element's class list satisfies all three of the following:
    (a) it positions the element clear of the existing floating cart button, using a `bottom-`
    value greater than the cart button's `bottom-6` and an `sm:bottom-` value greater than its
    `sm:bottom-8` (`components/cart/CartDrawerShell.tsx:L113`), so the two do not overlap at either
    breakpoint;
    (b) every `hover:scale-`/`group-hover:scale-`/`active:scale-`/`focus:scale-` utility it uses is
    paired with a `motion-reduce:` counterpart, so `tests/motion-reduce-coverage.test.ts` passes;
    (c) it contains no raw hex colour literal and no raw `px` value — colours come from the
    existing semantic tokens, so the control adopts each vendor's own palette rather than
    WhatsApp's brand green.

R9. Rendering `StorefrontChrome` with a `VendorProfile` whose `facebookUrl`, `instagramUrl` and
    `whatsappNumber` are all `null` produces no Facebook link, no Instagram link and no `wa.me`
    link anywhere in its output.

R10. `lib/repositories/vendor.ts`'s `VendorStorefrontConfigInput` declares `facebookUrl`,
     `instagramUrl` and `whatsappNumber` as optional `string | null`, and
     `updateVendorStorefrontConfig` passes each straight through to the `vendorConfig.update`
     data object so that `undefined` leaves the stored value untouched and `null` clears it.

R11. `features/admin/storefront.ts` exports a server action saving the three fields that calls
     `requireVendorRole("ADMIN")` first, returns a refusal without writing when that check fails,
     and derives the vendor id from the auth result rather than from any submitted field.

R12. `features/admin/storefront.ts`'s existing `updateDeliveryRules` action does not send
     `facebookUrl`, `instagramUrl` or `whatsappNumber`, so saving delivery rules leaves the three
     social values unchanged in the database.

R13. `/staff/storefront` renders a labelled input for each of the three fields, pre-filled with the
     stored value, and on an invalid submission re-renders with an error message naming the
     offending field while leaving the stored value unchanged.

R14. `specs/roadmap.md` records that shipping a WhatsApp contact link reverses the mission
     document's MVP out-of-scope line for WhatsApp, in its change log, citing `#405`.

R15. `docs/store-admin-guide/admin-tabs-guide.md`'s `## Storefront — /staff/storefront` section
     describes the three new fields, and every capability sentence added there corresponds to a
     control that exists on that page.

R16. `tests/social-contact-form.test.ts` exists and covers, at minimum: an accepted https URL, a
     rejected `javascript:` URL, a rejected `http:` URL, a blank URL parsing to `null`, an accepted
     digits-only WhatsApp number, and a rejected WhatsApp number containing `+`.

R17. `CHANGELOG.md` updated (Gate 4).

R18. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
