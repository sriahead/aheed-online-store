# Client Setup: verified forward-to dropdown and suggested sender (build notes)

Issues `#1392` (dropdown part only, stays open) and `#1403`. Spec commit `dbae09d3`, build commit
`00805263`, on `feature/1392-1403-forward-dropdown-default-sender` (off `origin/staging` `924a6ec`,
plus `#1399`'s Document commit `1c82baeb`).

## What changed and why

- **`lib/email/destinations.ts` (new, R1–R2):** `readDestinationAddresses({accountId, token}, fetch)`.
  - It pages `…/accounts/<id>/email/routing/addresses?page=n&per_page=50` up to 4 times, stopping on
    a short page.
  - Each request has its own `AbortController` with a 5 s `setTimeout`, cleared in `finally`. The
    timer covers the body parse too.
  - Every failure returns `unavailable`, and the reader logs nothing at all, which is the simplest way
    to keep the token out of every log line.
- **`lib/client-setup/sender-suggestion.ts` (new, R12–R13):** `suggestSender()` and
  `isRoutableSenderDomain()`. Both share one `customHosts()` derivation (eligible host, not the
  platform domain or under it) so the suggestion and the warning can't drift.
- **`lib/client-setup/destination-copy.ts` (new):** the R8 long messages and R10 short forms. It is a
  plain module because the server page can't import string constants from the `"use client"` forms
  file.
- **`lib/client-setup/inbound-groups.ts`:** `forwardTargetsVerified(rows, destinations)` gives R11's
  true / false / null.
- **`lib/client-setup/sections.ts`:** `EmailSetupFacts.forwardTargetsVerified`; the `destination`
  step returns it. The section's `status` is unchanged, so the step isn't part of "complete".
- **`lib/repositories/vendor.ts`:** `listVendorHosts(prisma, vendorId)` (host + isCanonical, ordered
  by host).
- **`lib/client-setup-service.ts`:** `getEmailSectionData` reads hosts and destinations in the same
  `Promise.all` as the profile. Credentials come from `readOptional(getAiEnv)` (R3: an existing
  `lib/config` reader, no new config). `EmailSectionData` gains `destinations`, `suggestedSender` and
  `senderRoutable`. The platform domain is `emailDomain(platform.platformFrom)`, or undefined when
  that is empty.
- **`components/staff/client-setup/EmailSetupForms.tsx`:**
  - **Add address form:** `AddInboundAddressForm` takes a required `destinations` prop. On `ok` it
    renders `ForwardToSelect`; otherwise it renders the unchanged `#1399` input plus a reason line
    (`data-destinations-unavailable`).
  - **Sender form:** `SenderForm` takes a required `suggestion` prop and fills its two uncontrolled
    inputs through refs.
- **`page.tsx`:**
  - the **Verified mailboxes** row (`data-verified-mailboxes`);
  - the R15 warning above the Sender form (`data-sender-unroutable`, `role="alert"`);
  - the new props.
- **Tests:**
  - **new:** `tests/email-destinations.test.ts` (R2), `tests/client-setup-sender-suggestion.test.ts`
    (R12–R13) and `tests/client-setup-email-forms.test.tsx` (R5–R9, R14);
  - **updated:** `tests/client-setup.test.ts` (R11; the `facts()` helper gains the field, plus a
    `forwardTargetsVerified` block) and `tests/client-setup-add-address-form.test.tsx` (the `#1399`
    cases now pass `destinations` as unavailable).
- **Docs:** `env-setup.md` gets:
  - a "Verified mailboxes in Client Setup" paragraph, plus a "suggested sender" paragraph;
  - the `#1399` paragraph's "cannot check that yet" line, updated;
  - a new sanity-check section with "Last run: not yet run".

  The platform admin guide's Client Setup section is updated too, and `docs.ts`/`ARTIFACT_INDEX.md`
  regenerated.

## Decisions taken during the build

- **Exactly one `forwardTo` is posted (R7) by toggling the select's `name`.**
  - The select carries `name="forwardTo"` unless **Other…** is chosen. Then it has no name, and the
    conditionally rendered text input carries it.
  - A hidden input mirroring the choice was rejected: it would bypass the browser's `required`/`type=email` check on the typed address.
- **The Other… sentinel value is `"__other__"`.** It can't collide with an email.
- **Preselection is computed once (`useState` initialiser).** A re-render doesn't reset the admin's
  choice.
- **The disabled pending options sit after the verified ones**, and **Other…** is last.
- **`fetch` is wrapped as `(input, init) => fetch(input, init)`** rather than passed bare. workerd can
  throw "Illegal invocation" for a detached `fetch`. This hasn't been observed here; it's a cheap
  guard.
- **The R15 warning lives in the page (server), not the form component**, because it reflects the
  *saved* sender. Its condition is `senderEmail.trim() !== "" && !senderRoutable`. It names
  `senderDomain`, falling back to the raw email when there is no `@`.
- **The suggestion's "differs" check compares names exactly and emails case-insensitively** (R14).
  It compares the suggestion with the saved values, not with whatever the inputs currently hold.
- **`listVendorHosts` lives in `lib/repositories/vendor.ts`.** No vendor-domain repository exists,
  and `platform-admin.ts`'s `listPlatformDomains` is platform-wide.

## Deviations from the spec

None. One note on R2's "a fetch that only settles when aborted": the test advances fake timers by
4,999 ms (still pending), then by 1 ms (settles as `error`).

## Known-shaky areas

- **The live `ok` state has not been exercised against Cloudflare.** The API shape (`result[]`,
  `email`, a `verified` timestamp or null, and `success`) comes from Cloudflare's docs, read during
  the `#1392` proposal. It is pinned only by the stubbed test. Validation's staging rows R5, R6, R10
  and R11 need the owner to add **Email Routing Addresses: Read** to the staging Merqify token. Until
  then, staging should show "Unavailable: token lacks Email Routing Addresses Read". **That
  assumes the API answers a missing permission with 401/403.** If it returns 200 with
  `success:false`, it shows "Cloudflare could not be reached" instead, which is still a fallback but
  the wrong reason. Check which one happens.
- **Dev's `CLOUDFLARE_*` belong to a different account (`…077cd`) from Merqify's.** So local
  preview's state depends on that token's permissions. Treat it as a fallback check, not proof of
  `ok`.
- **The per-request page cost:** Client Setup now waits on up to 4 Cloudflare calls per render
  (normally 1). The worst case, a hung API, is 5 s per page, so ≤ 20 s only if every page hangs
  after the first succeeds. That's acceptable for a platform-admin page. No caching, per plan.
- **`profile.name` is the branding name falling back to the vendor name** (`fetchVendorProfile`).
  So the suggested sender name is whatever the storefront shows. Check it matches the owner's
  expectation for both stores.
- **Hosts in dev** (`aheedsuperstore.localhost:8787`, `srimart.localhost:8787`, `localhost:8787`,
  `srimart-staging.nocaped.com`, `staging.aheedfoodcentre.nocaped.com`): with
  `EMAIL_FROM=no-reply@merqify.com`, the `nocaped` hosts are *custom* hosts under R12's definition.
  So dev will suggest e.g. `orders@srimart-staging.nocaped.com`, not the flat form. That follows the
  rule as written: the dev database still holds the pre-cut-over hosts. Staging and production carry
  the merqify hosts and should give `orders-<slug>@merqify.com`. Record what each environment shows
  at validation.
