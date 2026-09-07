# P9.2 — Remaining non-operational gaps (requirements / acceptance criteria)

Closes every remaining **P9.2** item that a repository change can close (**#644**), leaving only work
that needs a human at a console. Five substantive items — the guest-cart reaper (`#94`), the Stripe
webhook's unreachable unset-secret branch (`#621`), a readable `ErrorEvent` signal (`#437`'s code
tail), one shared env-file parser (`#505`'s code half) and required status checks on both branch
rulesets (`#472`, partial) — plus two issue closures (`#541`, `#101`) and the `CLAUDE.md` corrections
they force. Full reasoning, and the list of what is deliberately excluded, is in `plan.md`.

**No schema change and no migration anywhere in this slice.**

## `#621` — make the webhook's own unset-secret response reachable

R1. `lib/config.ts` exports a generic `readOptional` that returns the result of the function passed
    to it, or `undefined` if that function throws.

R2. `app/api/jobs/reconcile-payments/route.ts` imports `readOptional` from `@/lib/config` and
    contains no local definition of it; its existing 503 responses for an unset
    `JOB_INVOCATION_TOKEN` and an unset `STRIPE_SECRET_KEY` are unchanged in status and body.

R3. `app/api/webhooks/stripe/route.ts` obtains `STRIPE_WEBHOOK_SECRET` through `readOptional` and
    contains no bare `getPaymentEnv()` call outside it.

R4. With `STRIPE_WEBHOOK_SECRET` commented out of **both** `.env` and `.dev.vars`, a `POST` to
    `/api/webhooks/stripe` under `npm run preview` returns status `500` with the exact body
    `Webhook not configured`, and the Worker log records the line
    `stripe webhook received but STRIPE_WEBHOOK_SECRET is unset`.

R5. With `STRIPE_WEBHOOK_SECRET` restored in both files, a `POST` to `/api/webhooks/stripe` carrying
    an invalid signature returns a signature-rejection response and **not** the R4 body, proving R4's
    branch is reached only on the configuration it describes.

## `#94` — reap abandoned guest carts

R6. `lib/repositories/cart.ts` exports `deleteAbandonedGuestCarts(prisma, vendorId, olderThan, limit)`,
    taking its Prisma client as its first parameter, and `tests/repository-client-injection.test.ts`,
    `tests/repository-purity.test.ts` and `tests/repository-vendor-scoping.test.ts` all still pass.

    > **Amended during Build, 2026-09-07.** This requirement originally specified
    > `deleteAbandonedGuestCarts(prisma, olderThan, limit)` — with no `vendorId`. That signature is
    > unbuildable without weakening a repo invariant: `Cart` is a vendor-scoped model, so an exported
    > repository function issuing `deleteMany` against it while taking no vendor id fails
    > `tests/repository-vendor-scoping.test.ts`, whose only escape is an `ALLOWED` entry reserved for
    > deliberate cross-tenant exceptions recorded in ADR-004. A guest-cart reaper is not one. The
    > sweep therefore takes a vendor id and the service iterates active vendors, which is precisely
    > what `lib/payment-sweep-service.ts` already does with `listActiveVendorIds`. Amended here, in
    > the spec, rather than built around — see `build-notes.md`.

R7. `deleteAbandonedGuestCarts` deletes a cart only when its `guestToken` is non-null **and** its
    `updatedAt` is strictly older than `olderThan`; a cart with a non-null `userId` is never deleted
    regardless of age.

R8. The retention window is a single named constant equal to 30 days, carrying a comment citing
    `lib/cart-identity.ts`'s cookie `maxAge` as the reason for that value.

R9. `lib/guest-cart-reaper-service.ts` exists, resolves its Prisma client inside the call rather
    than at module scope, iterates the vendors returned by `listActiveVendorIds` and calls the
    repository function once per vendor, and is the only new module importing `@/lib/db` for this
    feature.

R10. `app/api/jobs/reap-guest-carts/route.ts` responds: `503` when `JOB_INVOCATION_TOKEN` is unset;
     `401` when the `x-job-token` header is absent or does not match; `405` to a `GET`; and `200`
     with a JSON body reporting the number of carts deleted when the token matches.

R11. `workers/scheduler/src/index.ts`'s `JOBS` array contains `/api/jobs/reap-guest-carts`.

R12. A live run of `deleteAbandonedGuestCarts` against the dev database deletes a seeded expired
     guest cart, leaves a seeded recent guest cart and a seeded signed-in cart untouched, and removes
     the expired cart's `CartItem` rows by cascade without a second statement.

## `#437` (code tail) — make an error spike detectable

R13. `lib/repositories/error-events.ts` exports `countRecentErrorEvents(prisma, since)` returning the
     number of `ErrorEvent` rows with `createdAt` at or after `since`, taking its client explicitly.

R14. A pure module exports an `evaluateErrorRate` function that, given a count, a threshold and a
     window, returns a summary naming the count, the window, the threshold and a boolean breach
     flag, and imports nothing from `@/lib/db`, `next/headers` or any live client — so it is
     unit-testable with no stubs, matching `lib/payment-sweep.ts`'s separation.

R15. `app/api/jobs/check-error-rate/route.ts` uses the same guard shape as R10 (`503` unset token,
     `401` bad token, `405` on `GET`) and on success returns `200` with `evaluateErrorRate`'s summary
     as its JSON body.

R16. That route emits exactly one `console.error` line carrying a fixed, greppable prefix when the
     threshold is breached, and emits no `console.error` when it is not.

R17. The evaluation window equals the scheduler's cron interval declared in
     `workers/scheduler/wrangler.toml`, so consecutive ticks neither overlap nor leave a gap, and the
     threshold is a single named constant with a comment recording that it is a starting value to be
     tuned once `#246` confirms log retention.

R18. `workers/scheduler/src/index.ts`'s `JOBS` array contains `/api/jobs/check-error-rate`.

R19. `ErrorEvent`'s write path and its existing probabilistic retention sweep in `recordErrorEvent`
     are unchanged by this slice.

R20. Both new job routes export `dynamic = "force-dynamic"`, matching
     `app/api/jobs/reconcile-payments/route.ts`.

## `#505` (code half) — one env-file parser

R21. `scripts/lib/env-file.ts` exports `parseEnvFile`, and `scripts/copy-product-images.ts`,
     `scripts/fill-product-images.ts`, `scripts/remove-vendor-domains.ts` and
     `scripts/restore-placeholder-images.ts` each import it.

R22. No file under `scripts/` other than `scripts/lib/env-file.ts` contains a definition of
     `parseEnvFile`.

R23. `scripts/lib/env-file.ts`'s docstring states why the hand-rolled parser is kept rather than
     replaced by `dotenv`, and records the local normalisation of `.env` / `.dev.vars` /
     `secrets/*.vars` that `#505` still needs and that no PR can perform.

## `#472` (partial) — required status checks

R24. `gh api repos/sriahead/aheed-online-store/rules/branches/main` and the same call for `staging`
     each list a rule of type `required_status_checks`.

R25. Every check context named by those rules appears, spelled identically, among the check names
     reported by a real completed run on the corresponding branch; no named context is absent from
     that set.

R26. A pull request open against `staging` after R24 lands shows those checks as required and becomes
     mergeable once they pass, demonstrating the rule does not block a green PR.

## `#541` and `#101` — closures

R27. Issue `#541` is closed, carrying a comment recording that a passing `kms` job cannot exercise
     `continue-on-error`, that run `34103597181` therefore settled nothing, and that the failure
     direction is safe because a mis-resolved expression leaves the job blocking.

R28. Issue `#101` is closed, carrying a comment recording that `#618`'s
     `app/api/jobs/reconcile-payments/route.ts` is the sweep it asked for and that only the
     operational `JOB_INVOCATION_TOKEN` remains.

## `CLAUDE.md` corrections

R29. `CLAUDE.md`'s branch-strategy section states that the repository is public, no longer asserts
     the paid-plan constraint as a current limitation on branch rules, and describes the
     `required_status_checks` rule added by R24.

R30. `CLAUDE.md` records `#541`'s accepted-risk closure and the reasoning behind it.

R31. `CLAUDE.md`'s vitest baseline names the file and test totals measured by a clean `npx vitest run`
     on this branch.

## Gates

R32. `git diff --name-only origin/staging -- prisma/` is empty, confirming no schema change and no
     migration.

R33. `npm run kms:validate` exits 0 and `npm run kms:check-generated` reports every generated
     artefact current.

R34. `CHANGELOG.md` updated on this branch (Gate 4).

R35. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
