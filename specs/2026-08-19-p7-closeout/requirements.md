# P7 closeout — accessibility, RLS determination & guest data rights (requirements)

Closes **P7 — Compliance & hardening** by discharging its three remaining obligations in one
combined slice (issue **#251**): an accessibility gate plus hand-authored dialog semantics for the
storefront's modal surfaces (**#217**), a recorded determination on Postgres row-level security
(**#220**), and UK GDPR erasure for guest shoppers (**#222**). Builds on P7b (#216), whose erasure
shape and repository patterns this slice mirrors rather than reinvents. Narrative, measured
findings and the decisions behind the scope boundaries are in `plan.md`.

## Part A — Accessibility (#217)

> **Correction applied at Build (2026-08-19), approved before proceeding.** R2–R6 as approved named
> `components/cart/CartDrawer.tsx`. That file was **dead code** — added by P7a (commit `624a842`)
> and never imported by anything, as `git log -S` across all branches confirms. The drawer users
> actually get is `components/cart/CartDrawerShell.tsx`, which `components/layout/Header.tsx`
> renders. R2, R5 and R6 below now name the live component; `CartDrawer.tsx` was deleted rather
> than repaired, which also cleared the two `jsx-a11y` violations R1 surfaced (both were in it).
> Building the approved text literally would have asserted accessibility properties of a component
> no user can reach.

R1. `eslint.config.mjs` applies `eslint-plugin-jsx-a11y`'s recommended rule set at severity
    `error` to `app/**/*.tsx`, `components/**/*.tsx` and `features/**/*.tsx`, and leaves
    `jsx-a11y/label-has-for` and `jsx-a11y/control-has-associated-label` disabled (both ship as
    `"off"` in that recommended set; see `plan.md`).

R2. The root element of the open cart drawer in `components/cart/CartDrawerShell.tsx` carries
    `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby` whose value is the `id` of a
    heading element rendered inside the drawer.

R3. When the drawer opens, focus moves to an element inside it; `Tab` from the last focusable
    element inside it moves to the first, and `Shift+Tab` from the first moves to the last; when
    the drawer closes, focus returns to the element that was focused before it opened.

R4. Pressing `Escape` while the drawer is open invokes the same close path as the close button.

R5. Every interactive control rendered by `components/cart/CartDrawerShell.tsx` and
    `components/consent/CookieBanner.tsx` has a non-empty accessible name.

R6. Heading elements rendered inside `components/cart/CartDrawerShell.tsx` descend without skipping a
    level, in both the empty-cart and populated-cart states.

R7. `design-system/tokens/tokens.css` sets `--color-action` to `#2e7d32`, `--color-accent` to
    `#a85400`, `--color-danger` to `#c82d2d`, `--color-action-hover` to `#276a2b` and
    `--color-accent-hover` to `#8f4700`. The `--color-brand-*` primitives keep their existing
    brand-kit values; only the semantic layer changes.

R8. A test resolves the semantic colour tokens in `design-system/tokens/tokens.css` through their
    `var()` indirection to literal hex values, computes the WCAG 2.x contrast ratio for each pair
    in an explicitly declared list, and asserts every pair is at least 4.5:1. The list contains at
    least these 17 pairs: `primary`, `action`, `accent`, `danger` and brand ink each on `#ffffff`;
    `#ffffff` on each of `primary`, `action`, `accent`, `danger`, `action-hover`, `accent-hover`;
    `primary` and `action` on `--color-action-tint`; `accent` on `--color-accent-tint`; `danger` on
    `--color-danger-tint`; and brand ink and `primary` on `--color-surface-muted`.

R9. R2 through R6 are asserted by tests that execute in a DOM environment under `npm test` — not by
    grepping component source.

R10. `specs/design-system.md` records the five token changes in R7 and states that the
     `--color-brand-*` primitives are unchanged, so the next reader does not "restore" the
     brand-kit hex values into the semantic layer.

## Part B — Row-level security determination (#220)

R11. An experiment is executed against a real Neon database that determines whether a Postgres
     session GUC set on one query is still visible to a subsequent query issued through
     `PrismaNeonHttp` (`lib/db.ts`), and its method plus raw output are recorded at
     `specs/2026-08-19-p7-closeout/rls-experiment.md`.

R12. `specs/decisions/ADR-004-multi-tenancy.md` gains a section recording the determination reached
     in R11, states whether row-level security is adopted and why, bumps its `version` front-matter
     field, and sets `updated: 2026-08-19`.

R13. If R12 records that RLS is **not** adopted, an executable compensating control exists in the
     repo and passes — a test or lint rule that fails when a `lib/repositories/*` query that reads
     or writes a vendor-scoped model omits a `vendorId` constraint. If R12 records that RLS **is**
     adopted, the policies ship in a Prisma migration carrying the comment `CLAUDE.md` requires for
     hand-authored DDL, naming what Prisma's schema language cannot express and why.

R14. The `no-restricted-imports` rule in `eslint.config.mjs` that blocks `@/lib/db` and
     `@prisma/client` imports from `app/`, `features/` and `components/` is still present and no
     weaker than before this slice, whatever R12 concludes.

## Part C — Guest data rights (#222)

R15. A route exists that lets a guest request erasure of one order's personal data, reachable from
     `/orders/lookup` without a session.

R16. That route performs no erasure unless `findOrderForGuestLookup` returns a match for the
     submitted order-number and email pair; a wrong order number and a mismatched email are
     indistinguishable in the response.

R17. `checkOrderLookupRateLimit` is called before the lookup on every erasure request, and a caller
     over the threshold is refused without any database read of order data.

R18. The erasure executes inside a `$transaction` on `getPrismaWs()`, sets the matched
     `Order.guestEmail` to null, and redacts the `Address` row that order's `addressId` references.

R19. After erasure the `Order` row still exists and its `totalPence`, `status` and `orderNumber`
     are unchanged.

R20. `/privacy` describes the guest erasure route and states that it erases one order per request,
     rather than describing only the account-holder self-service route.

R21. A GitHub issue exists recording the deferred machine-readable guest export (`plan.md`, Part C
     decision 1), is on the delivery board, and is referenced from this slice's `plan.md`.

## Part D — `CLAUDE.md` repository-facade rule

R22. `CLAUDE.md`'s repository-layer rule no longer presents `getCartRepository` as a model to
     follow without qualification, records that nine facade factories in `lib/repositories/*` do
     not comply, and references **#252**.

## Housekeeping

R23. `specs/roadmap.md`'s change log gains a row for **PR #250**, citing the PR number or its merge
     SHA `b1d807f`.

R24. `ARTIFACT_INDEX.md` contains an entry for `specs/2026-08-19-p7-closeout/plan.md`.

R25. Issue **#46** is closed.

R26. No file added or edited by this slice under `docs/` or `specs/` contains a bare `<` character
     immediately followed by a digit, and the internal KMS docs site builds with these documents
     assembled in.

R27. `CHANGELOG.md` updated (Gate 4).

R28. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
