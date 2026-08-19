# P7 closeout — accessibility, RLS determination & guest data rights (build notes)

Branch `feature/251-p7-closeout`, five commits: the spec, then one per part.

## What changed and why

### Part A — accessibility (R1–R10)

**`eslint.config.mjs`** now applies `jsx-a11y`'s recommended set at `error` for `app/`,
`components/` and `features/` `.tsx`. Verified after the fact: 34 `jsx-a11y` rules present, 31
enabled, **0 still at warn**. The escalation is computed by a helper that maps recommended's own
severities up, rather than by listing rules — recommended ships `label-has-for` and
`control-has-associated-label` as `"off"`, and forcing every rule on produces 140 findings against
markup that is largely correct.

The block carries **no `plugins` key**. `eslint-config-next` already registers `jsx-a11y`, and flat
config treats a second registration of the same name as a hard error (`Cannot redefine plugin`)
rather than a merge. The import exists only for its rule table. That cost one failed run and is
noted in the file so it isn't rediscovered.

**`components/cart/CartDrawer.tsx` was deleted, not repaired.** See "Deviations" — it was dead code
and it held both of the two violations the new gate found.

**`components/cart/CartDrawerShell.tsx`** (the live drawer) already had the ARIA half: `role`,
`aria-modal`, a labelled close button, `aria-hidden` icons, and an opener with
`aria-haspopup`/`aria-expanded`. What it lacked was everything a mouse never reveals. Added: focus
moved into the panel on open, a `Tab`/`Shift+Tab` trap, focus restored to the cart button on close,
`Escape`, and `aria-labelledby` pointing at its own `h2` so the accessible name carries the item
count instead of a hardcoded string.

Two shape decisions inside that are worth knowing:

- **Key handling lives on `document`, not on the dialog's `onKeyDown`.** A container handler only
  fires while focus is inside it, so anything that moved focus out would also take `Escape` away —
  precisely when a user most needs it. A test asserts Escape still works after blurring. It also
  avoids assigning key handlers to a non-interactive element, which `jsx-a11y` flags; the lint rule
  was the prompt, but the correctness argument is the reason.
- **The backdrop is a real `<button>`, `aria-hidden`, `tabIndex={-1}`.** Natively interactive (so no
  suppression needed), but not announced and not tab-reachable — a second reachable "Close cart"
  adds nothing over the header button plus `Escape`. A test asserts exactly one is reachable.

**Three semantic colour tokens were darkened for WCAG AA.** `--color-action` `#4caf50` → `#2e7d32`,
`--color-accent` `#f57c00` → `#a85400`, `--color-danger` `#d32f2f` → `#c82d2d`, plus both derived
hover shades. The `--color-brand-*` primitives are untouched. That split is what made this cheap:
45-plus call sites across 20-plus files read the semantic layer, so five values fixed all of them
with no component edits.

`tests/design-tokens-contrast.test.ts` reads `tokens.css` itself (not a copy of the values) and
asserts 17 pairs at 4.5:1. `specs/design-system.md` records the change, and gained a "Modal
surfaces" rule plus a note about why the section's existing rules didn't prevent any of this.

### Part B — RLS determination (R11–R14)

`scripts/rls-experiment.ts` probes four ways to carry a tenant in a session GUC against a real Neon
branch. Raw output and interpretation in `specs/2026-08-19-p7-closeout/rls-experiment.md`:

| Case | Result |
|---|---|
| A. HTTP client, `SET` then read as two queries | GUC **lost** |
| B. HTTP client, both in one batched `$transaction` | **`Transactions are not supported in HTTP mode`** |
| C. WebSocket client, inside one interactive transaction | survives |
| D. WebSocket client, read after the transaction ends | correctly gone |

A is the shape of every repository read. B is the finding that matters most — the batched escape
hatch the spec hoped might exist does not exist at the adapter layer, so this cannot be fixed by
restructuring calls. RLS would require routing every read through WebSockets: the configuration that
caused #187. D is reassuring — `SET LOCAL` doesn't leak between callers on a pooled connection.

`ADR-004` is amended (v1.3.0 → v1.4.0) with the determination, the evidence, the compensating
control, and its limits. Decision 2's own "Deferred: RLS → P7" bullet is struck through in place
rather than left to contradict the new section three screens further down.

Compensating control: `tests/repository-vendor-scoping.test.ts`. See "Decisions" for why it asserts
what it does.

### Part C — guest data rights (R15–R21)

`eraseGuestOrderData(prisma, vendorId, orderNumber, email)` in `lib/repositories/data-rights.ts` —
pure, explicit arguments, no request context, so a `tsx` script can exercise it directly. It
**verifies the credential pair itself, at the query level, inside the transaction**. That is the
load-bearing choice: there is no window between "the caller proved ownership" and "we erased", and
no way to invoke it with an unverified pair. It also requires `userId` to be null, so an
account-holder's order can't be erased through a weaker proof than `/account/data` demands.

Shape mirrors `eraseVendorData`: `guestEmail` cleared, the delivery address redacted in place
(`Order.addressId` is not nullable), `totalPence`/`status`/`orderNumber` untouched, all inside a
`$transaction` on `getPrismaWs()`.

`getGuestDataRightsService()` in `lib/data-rights-service.ts` — beside, never inside,
`lib/repositories/`. `features/orders/guest-data-rights.ts` is the action; it re-resolves the vendor
and re-proves the pair rather than trusting the page that rendered the form, because a server action
is a public endpoint at a stable id. Field rules went into the existing `lib/data-rights-form.ts`
rather than a new module (reuse before create), and had to live outside the `"use server"` file
anyway — a same-file value export 500s every action in it at runtime (#159).

`/privacy` now describes the guest route and its one-order scope.

### Part D + housekeeping (R22–R26)

`CLAUDE.md`'s facade rule corrected — it named `getCartRepository` as the model to match without
saying which part, and that function's *location* is the violation. Now: copy the shape, not the
address; all nine non-compliant factories named; `lib/data-rights-service.ts` and `lib/auth-rbac.ts`
given as the compliant examples until #252 lands.

PR #250's roadmap row backfilled (the carry-forward `sdd:audit` had been reporting). `#46` closed
with its reasoning. `ARTIFACT_INDEX.md` rebuilt. Internal KMS docs site built locally — 77 pages,
clean.

## Decisions taken during the build

**The compensating control asserts a weaker invariant than first attempted, deliberately.** The
first version asserted that every individual Prisma call carries `vendorId` in its `where`. It
flagged **38 of 155 call sites**, and the large majority were correct code keyed by an id already
fetched under a vendor scope (`cartItem.deleteMany({ where: { cartId: cart.id } })`) or a `where`
held in a variable. Making that a gate would have required roughly 38 hand-written justifications —
the kind of list that gets rubber-stamped rather than read, a control that launders review instead
of performing it. The shipped version asserts what a static check can establish soundly: every
exported function querying a vendor-scoped model takes a vendor id, and a function given one
actually references it. Twelve exceptions are allowlisted **with reasons**. ADR-004 states the
residual gap rather than implying parity with RLS.

**The "uses it" check reads the whole function body, not the Prisma call's arguments.** First run
flagged `listInventoryForStaff` as decorative; it is not — it builds
`const whereClause: Prisma.ProductWhereInput = { vendorId }` above the call. Worth keeping the
assertion because `noUnusedParameters` is **not** enabled in `tsconfig.json`, so nothing else would
catch a wholly-unused `vendorId`.

**`--color-danger` was darkened too**, beyond the two tokens put up for decision. Its pair with
`--color-danger-tint` sat at 4.36:1 and is the repo's standard **error-message** treatment at
`text-sm` across checkout, every account form and `OrderStatusBadge`. Leaving it would have meant
carving out the most safety-relevant text on the site. Flagged in `plan.md` as an extension.

**Guest erasure shares the lookup's rate limiter and its budget** rather than getting its own. An
erasure endpoint that answers "no such order" quickly enough is an oracle for guessing
order/email pairs; a separate budget would hand an attacker a second one. The IP resolution is
byte-identical to the lookup page's for the same reason.

**A failed guest erasure returns the lookup's own wording** and does not distinguish wrong-order
from wrong-email from already-erased. Each of those is a fact about someone else's order.

**Confirmation is a fixed word (`ERASE`), not the guest's email.** They have already typed the email
once to be shown the order; asking again would look like a control while adding nothing.

**The guest erasure UI is a `<details>` disclosure on the lookup result**, not a separate route. The
credential pair is already proven at that point and a second page would need to carry it in a URL.

**Test fixture uses `<a href="#checkout">`** rather than `/checkout` — a bare `<a>` to a real route
trips `@next/next/no-html-link-for-pages`, and the fixture only needs a focusable anchor.

**Reverted `kms/site-internal/next-env.d.ts`.** Running `next build` rewrites it
(`.next/dev/types` → `.next/types`); it flip-flops with whichever of `dev`/`build` ran last and is
not this slice's change.

## Deviations from the spec

**R2–R6 were retargeted from `components/cart/CartDrawer.tsx` to
`components/cart/CartDrawerShell.tsx`, and the former was deleted.** Raised with the user at Build
and approved before proceeding; the correction is recorded at the top of `requirements.md` Part A
and in `validation.md`'s preamble.

`CartDrawer.tsx` was **dead code** — added by P7a (`624a842`) and never imported by anything, which
`git log -S` confirms across all branches. The live drawer is `CartDrawerShell.tsx`, rendered by
`components/layout/Header.tsx`. Both of the two `jsx-a11y` violations R1 surfaced were inside it.
The accessibility defects the spec described in it were real, but in a component no user could
reach; building R2–R6 against it would have produced tests asserting properties of something that
never renders.

Consequences already applied to the spec: R1's validation row targeted the deleted file for
`--print-config` and now names `CartDrawerShell.tsx`; R4's row described an `onClose` prop that the
live component doesn't have (it owns its own open state) and now describes the real close path.

**R7/R8 were renumbered.** The approved spec had `R7`/`R7a`/`R8`/`R8a`; the template reserves
lettered sub-requirements for prerequisite fixes discovered *mid-slice*, not spec-time additions, so
they became sequential R7–R10 with everything after shifted. Requirement and validation-row counts
match at 28 with identical ordering.

**R27 (CHANGELOG) is satisfied in this stage, not during Build** — Gate 4 lands at `/build-notes`
per `CLAUDE.md`.

## Fix (post-`/validate`, 2026-08-19)

**`/validate` found R7/R8's contrast fix never reached a real rendered page.**
`lib/vendor-theme.ts`'s `brandStyle()` (pre-existing since P6a, `#158`) injects per-vendor branding
as an inline `style` on the root element of every page, and was re-declaring `--color-action`,
`--color-accent`, `--color-danger` and their hover shades directly from each vendor's raw
primitive colour — the SAME primitive→semantic mapping `tokens.css` used *before* this slice. This
slice's Part A deliberately broke that 1:1 mapping (that is the whole fix: darken the semantic
value independently of the brand-kit primitive), but never touched `brandStyle()`, which kept
computing the old mapping. An inline style always outranks a stylesheet `:root` rule on CSS
specificity, so every real page — storefront and admin, every vendor including Aheed — rendered
the pre-slice, AA-*failing* hex regardless of what `tokens.css` said. `/validate`'s own jsdom tests
never caught this because they read `tokens.css` directly and never render through the real
layout; the defect only showed up by pulling live rendered HTML from `npm run preview` against
staging.

**Root cause, not the check.** `tests/design-tokens-contrast.test.ts` and R7/R8 as worded were
correct and stayed unchanged — loosening them would have been validating around a real defect. The
code that needed reshaping was `brandStyle()` itself.

**The fix, and why it stops at exactly these five tokens.** `lib/vendor-theme.ts`'s `brandStyle()`
no longer re-declares `--color-action`, `--color-accent`, `--color-danger`, `--color-action-hover`
or `--color-accent-hover` — those five now always resolve to `tokens.css`'s fixed, AA-audited
default, for every vendor. Three *other* tokens brandStyle() sets — `--color-primary`,
`--color-surface-muted`, and the three semantic tints (`--color-action-tint` etc.) — are left
exactly as they were, because they are still plain `var()` aliases to a primitive in `tokens.css`
(R7 only darkened the five *base*/hover tokens, never the tints or primary/surface-muted), and a
CSS custom property's `var()` substitutes once at the element that declares it — an override
further down the tree only reaches a semantic alias if that alias is re-declared at the same
element, which is the entire reason `brandStyle()` exists. Removing those three would have broken
vendor branding for a property this slice never touched; that would have been fixing a bug by
introducing a different one.

**A consequence, checked and recorded rather than assumed harmless.** SriMart's `VendorBranding`
row carries real, distinct action/accent/danger primitives (`#1e88e5` blue, `#8e24aa` purple,
`#c62828` red) that were never contrast-audited. Before the fix it rendered them directly,
unaudited. After the fix, SriMart's action/accent/danger buttons now render as Aheed's audited
green/orange/red instead of SriMart's own colours — differentiation for those three roles is gone,
traded for every vendor now guaranteeing AA on them. This matches ADR-004 decision 5's original
wording ("the semantic layer... stay unchanged"; only primitives vary), so it is a correction
toward an already-accepted architecture, not a new one — but it is a real, visible behaviour change
for the one other live vendor, filed as **#255** rather than left implicit. Verified live: fetched
`/` with `Host: srimart-staging.nocaped.com` under `npm run preview` against staging and confirmed
`--color-primary`/`--color-surface-muted`/tints still carry SriMart's own blue/tints while
`--color-action` etc. are absent from the inline style (falling through to the shared stylesheet
default) for both vendors.

**Verification.** Reran the full pre-flight (`lint`, `typecheck`, `vitest run` — 447/447,
`build`) clean. Live-verified against staging under `npm run preview`: Aheed's compiled stylesheet
and rendered inline style now agree (`--color-action:#2e7d32`, `--color-accent:#a85400`,
`--color-danger:#c82d2d`, hovers `#276a2b`/`#8f4700`); SriMart's inline style still carries its own
`--color-primary`/`--color-surface-muted`/tints and no longer overrides the three base colours.
No test previously covered `lib/vendor-theme.ts` — none existed to break or need updating.

## Known-shaky areas

**R15–R19 have had no live run. This is the biggest gap and where validation should start.**
Everything in Part C is verified only by typecheck, lint and the pure-function unit tests. Nothing
has exercised the actual erasure against Postgres, through a browser, under `npm run preview`.

- **`prisma/seed.ts` creates no guest order** — no row with a `guestEmail`. There is nothing for the
  lookup to match out of the box, so a guest checkout has to be placed end-to-end first (signed out)
  or a fixture written. `validation.md`'s precondition says so. Record `orderNumber`, `totalPence`
  and `status` before erasing; R19 compares against them.
- **The transaction path has never executed.** `eraseGuestOrderData` is the first new
  `getPrismaWs()` `$transaction` since P7b. Worth confirming it actually runs on the WebSocket
  client under `preview` rather than trusting the call site reads correctly.
- **R17's ordering claim is untested**: that the rate limiter runs *before* any order read. The code
  is ordered that way; nothing proves it. `validation.md` gives a concrete way to check (exceed the
  limit, then submit a *valid* pair and confirm it is still refused).
- **`revalidatePath("/orders/lookup")` after erasure** — the page is `force-dynamic` and driven by
  GET search params, so this may be a no-op. Harmless, but if the erased state doesn't reflect on
  re-lookup, that call is the first place to look.

**The environment this was built against is not staging.** `.env`/`.dev.vars` point at
`ep-soft-band-za9nj4sj`, which is the per-developer Neon branch from #226 — neither staging
(`ep-empty-scene-zafjzeye`) nor production (`ep-young-glitter-zadlkttm`). Correct and safe for local
work and for the read-only RLS probe, but **re-check before any live-DB validation row**, and note
that `validation.md`'s preamble says "confirm the host matches staging" while the dev-branch tier is
what the repo now standardises on locally. Reconcile deliberately rather than assuming either.

**The a11y tests run in jsdom, not a browser.** Roles, accessible names, focus order and heading
levels are DOM-level properties, so this is sound — but it proves nothing about *visible* focus
rings, actual screen-reader announcement, or the drawer's behaviour on touch. The contrast test
computes ratios from tokens; it does not verify which token any given element actually renders with.

**`jsdom` environment setup is slow** (~25s cold on first run, ~4s warm). If CI times out on the
test step, that is the likely cause rather than a hang.

**The contrast test asserts 17 declared pairs, not every pair the UI can produce.** A component
combining two tokens not in that list is unchecked. The list covers what the storefront actually
uses today; a new combination needs adding to it.

**The lookup page has an `h1` → `h4` → `h3` heading skip** (`app/(storefront)/orders/lookup/page.tsx`).
Real, and it violates `design-system.md`'s own heading-hierarchy rule — but outside R6, which scopes
to the cart drawer. Left deliberately rather than silently widening the slice, and filed as **#254**
— it belongs with a broader storefront heading pass reusing the drawer test's own assertion.

**Nine facade factories still violate the rule `CLAUDE.md` now states correctly** (#252). The wording
is fixed; the code is not. The vendor-scoping test allowlists all nine by name, so the list cannot
grow quietly, but a reader who sees the allowlist without reading #252 may take them as endorsed.
