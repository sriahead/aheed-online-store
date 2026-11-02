# Client Setup: verified forward-to dropdown and suggested sender (requirements / acceptance criteria)

Closes `#1403` and the dropdown part of `#1392`. `#1392` stays open for routing-rule and
sending-domain state. This builds on `#1217`
(`specs/2026-11-01-cloudflare-email-service/`) and `#1399`
(`specs/2026-11-02-default-forward-inbox/`).

Client Setup (`/staff/platform/client-setup`, platform admins only) gets three changes:
- it reads the Cloudflare account's Email Routing destination addresses, and offers Forward to as
  a dropdown of the verified ones, falling back to a text field when the read fails;
- it computes the "Verify the forward-to mailbox" guide step;
- it suggests each store's sender and warns when the saved sender cannot receive replies.

No schema change. Read `plan.md` for the decisions and exclusions.

Terms used below:
- **"The page"**: `/staff/platform/client-setup` with a store selected, Email section shown.
- **"Platform domain"**: the domain part of `EMAIL_FROM`, lower-cased. It is undefined when
  `EMAIL_FROM` is unset or invalid.
- **"Eligible host"**: one of the store's `VendorDomain.host` values that has no port (no `:`), is
  not `localhost` and does not end with `.localhost`, and is not an IPv4 literal. Dev databases hold
  hosts like `localhost:8787`. They are ignored by R12 and R13.
- **"Custom host"**: an eligible host that is neither equal to the platform domain nor ends with
  `.<platform domain>`. When the platform domain is undefined, every eligible host is custom.
- **"Store domain"** of a custom host: the host lower-cased, with one leading `www.` removed.
- **"The reader"**: the destination-address function in R1.

## Destination-address reader

R1. A module under `lib/email/` exports an async function, the reader. It takes
    `{ accountId?: string; token?: string }` and a `fetch` implementation, and resolves to one of:
    - `{ status: "ok", addresses: { email: string; verified: boolean }[] }`
    - `{ status: "unavailable", reason: "not-configured" | "forbidden" | "error" }`

    It never throws.

R2. The reader's behaviour:
    - **No account id or token:** it returns `not-configured` and makes no `fetch` call.
    - **Otherwise:** it requests
      `https://api.cloudflare.com/client/v4/accounts/<accountId>/email/routing/addresses?page=<n>&per_page=50`
      with header `Authorization: Bearer <token>`. It starts at page 1 and stops when a page returns
      fewer than 50 results, or after page 4.
    - **Each address:** `email` is lower-cased, and `verified` is true exactly when the API's
      `verified` field is a non-empty string.
    - **Timeout:** each request carries an abort signal that fires after 5 seconds, and an
      aborted request gives `error`. The page never waits on Cloudflare longer than that per page.
    - **Errors:**
      - HTTP 401 or 403 gives `forbidden`;
      - any other non-2xx, a body with `success: false`, a thrown `fetch`, or unparsable JSON gives
        `error`.
    - **The token** never appears in the returned value or in any log line the reader writes.

    A unit test with a stubbed `fetch` covers:
    - not-configured (asserts `fetch` was not called);
    - a single page;
    - two pages (50 + 3);
    - the 4-page cap;
    - 403 → forbidden;
    - 500 → error;
    - `success: false` → error;
    - a thrown fetch → error;
    - a fetch that only settles when aborted → error (with fake timers, not a real 5 s wait);
    - verified null vs a timestamp;
    - the token absent from the result's JSON.

R3. The reader's credentials come from `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, read
    through `lib/config` (an existing or new exported reader). No file added or changed by this
    slice reads `process.env` directly.

## Forward to dropdown

R4. `EmailSectionData` (`lib/client-setup-service.ts`) carries a `destinations` field holding the
    reader's result for the request. `getEmailSectionData` obtains it by calling the reader with
    the R3 credentials and the global `fetch`. The rendered page never contains the token: only
    the reader's result reaches the client.

R5. When `destinations.status` is `ok`, `AddInboundAddressForm` renders a `<select>` labelled
    **Forward to**, with:
    - one option per verified address, enabled;
    - one option per unverified address, `disabled`, with the visible text ending
      "(awaiting verification)";
    - a final option **Other…**.

    Selecting **Other…** shows an email text input. It also shows a warning that Cloudflare
    forwards only to verified addresses. Any other choice hides both.

R6. The R5 preselection:
    - when `#1399`'s default (status `set`) is a verified address, that option is preselected;
    - when the default is set but not verified, **Other…** is preselected with the text input
      prefilled with the default;
    - when the default is unset or invalid, the first verified address is preselected, or **Other…**
      when there is none.

R7. In every R5 state, submitting the form posts exactly one `forwardTo` value: the selected
    address, or the typed text when **Other…** is chosen. `addInboundAddressAction` and its
    validation are unchanged. Its existing tests pass unmodified.

R8. When `destinations.status` is `unavailable`, `AddInboundAddressForm` renders the `#1399` text
    input exactly as before (prefill and hint rules unchanged), plus one line naming the reason:
    - `not-configured`: "Verified mailboxes are not available: Cloudflare credentials are not set
      for this environment."
    - `forbidden`: "Verified mailboxes are not available: the Cloudflare token lacks Email Routing
      Addresses Read."
    - `error`: "Verified mailboxes are not available: Cloudflare could not be reached."

R9. Component tests (Testing Library) for `AddInboundAddressForm` cover:
    - verified and pending options, with the pending one disabled;
    - the three R6 preselection cases;
    - the Other… input appearing and disappearing;
    - the single posted `forwardTo` value in the select case and the Other… case (read from the
      form's `FormData`);
    - each R8 fallback message.

R10. The "Sending status (this environment)" card shows a **Verified mailboxes** row:
    - "<v> verified, <p> pending" when `ok`;
    - when `unavailable`, "Unavailable: " followed by the R8 reason in short form: "credentials not
      set", "token lacks Email Routing Addresses Read", or "Cloudflare could not be reached".

## Guide step

R11. The Email section's `destination` step (`lib/client-setup/sections.ts`) computes `done` from
    a new `EmailSetupFacts` field:
    - `true` when the read is `ok`, the store has at least one receiving address, and every
      distinct `forwardTo` of the store's receiving addresses is a verified destination;
    - `false` when the read is `ok` and that does not hold;
    - `null` when the read is `unavailable`.

    `tests/client-setup.test.ts` is updated so `destination` is no longer asserted to be always
    `null`. A test covers all three outcomes, including a store with one verified and one
    unverified forward-to (`false`). The `sending-domain` and `routing-rule` steps stay `null`.

## Suggested sender

R12. A plain (non-`"use server"`) module under `lib/client-setup/` exports a pure function. It
    takes the vendor's name, its slug, its `VendorDomain` hosts (each with `isCanonical`), and the
    platform domain (or undefined). It returns `{ name, email } | null`:
    - `name` is the vendor's name;
    - when the store has at least one custom host, `email` is `orders@<store domain>` of:
      - the canonical custom host, if any;
      - otherwise the alphabetically first custom host;
    - otherwise, when the platform domain is defined, `email` is `orders-<slug>@<platform domain>`;
    - otherwise the function returns `null`.

    A unit test covers:
    - a custom canonical host;
    - `www.` stripped;
    - canonical preferred over an alphabetically earlier custom host;
    - only platform hosts (gives the flat form);
    - a host equal to the platform domain counting as a platform host;
    - no `EMAIL_FROM` with no custom host (gives `null`);
    - no `EMAIL_FROM` with a custom host (gives the custom form);
    - `localhost:8787`, `srimart.localhost:8787` and `127.0.0.1` ignored, so a store with only
      those and a platform domain gets the flat form.

R13. The same module exports a pure function. It returns `true` when a sender email's domain is
    "routable", meaning it equals any of:
    - the platform domain;
    - the store domain of any of the store's custom hosts;
    - a domain in `EMAIL_VERIFIED_DOMAINS`.

    It returns `false` otherwise, including for an empty sender. A unit test covers each `true`
    branch, a `nocaped` sender with merqify platform hosts (`false`), and mixed case.

R14. The Sender card on the page:
    - when R12 returns a suggestion that differs from the saved sender (both fields compared,
      email case-insensitively), it shows the suggestion as text and a **Use suggested sender**
      button;
    - clicking the button sets the Sender name and Sender email inputs to the suggestion without
      submitting;
    - the existing **Save sender** saves whatever the inputs hold;
    - when the saved sender equals the suggestion, or R12 returns `null`, neither the suggestion nor
      the button renders.

    A component test covers the button filling both inputs with no submit, and the hidden case.

R15. When the saved sender email is non-empty and R13 returns `false`, the Sender card shows a
    `role="alert"` warning. It names the sender's domain and says replies to it may not arrive,
    because it is not the platform domain or one of this store's domains.

R16. All copy added by this slice is vendor-neutral: no vendor name and no product example
    (`docs/developer-portal/app-conventions.md`, "User-facing copy"). The local part `orders` is
    neutral. `tests/vendor-neutral-copy.test.ts` passes.

## Docs

R17. `docs/developer-portal/env-setup.md`, "Email: sending and receiving", states:
    - that `CLOUDFLARE_API_TOKEN` (each environment's Merqify token) needs **Email Routing
      Addresses: Read** for the dropdown;
    - what Client Setup shows without it;
    - the suggested-sender rule.

    Its sanity-check section gains steps for this slice with a "Last run" line.

R18. `docs/platform-admin-guide/platform-admin-guide.md`, Client Setup section, describes:
    - the dropdown and its Other… choice;
    - the fallback text field;
    - the Verified mailboxes row;
    - the computed guide step;
    - the suggested sender and its button;
    - the unroutable-sender warning.

    Every added sentence traces to a control built in R5–R15.

## Gates

R19. `CHANGELOG.md` updated (Gate 4).

R20. All of these exit 0 after this slice:
    - `npm run lint`
    - `npm run typecheck`
    - `npx vitest run --maxWorkers=4`
    - `npm run format:check`
    - `npm run kms:validate`
    - `npm run build`

    `npm run kms:coverage` reports no new uncovered file.
