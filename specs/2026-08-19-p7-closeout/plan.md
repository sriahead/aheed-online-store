---
id: p7-closeout-plan
title: "P7 closeout — accessibility, RLS determination & guest data rights (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-19
visibility: internal
summary: Closes P7 in one combined slice — a real accessibility gate plus hand-authored dialog semantics, a recorded determination on Postgres row-level security, and UK GDPR erasure for guest shoppers who have no account.
tags: [p7, accessibility, wcag, rls, gdpr, multi-tenancy, sdd]
related: [adr-004-multi-tenancy, architecture, design-system, mission]
---

# P7 closeout — accessibility, RLS determination & guest data rights (plan)

**Goal:** close **P7 — Compliance & hardening** by discharging its three remaining obligations in
one loop. Shipping this slice means the phase's scope is complete: an accessibility gate that
actually fails CI, a recorded answer to ADR-004's deferred row-level-security decision, and a UK
GDPR erasure route for the shoppers P7b could not serve.

Decomposition was settled at `/propose` on 2026-08-19 (issue **#251**). One combined slice was
chosen deliberately over three loops. The cost is a single large `validation.md`; the mitigation is
that the three parts touch disjoint files, so a failure in one does not force rework in the others.

## Part A — Accessibility (#217)

`specs/mission.md` sets WCAG 2.2 AA as a best-effort target and nothing in the repo works toward it
or measures it.

**What `/propose` and `/spec` actually found — this corrects the issue's framing in one useful
way.** `eslint-plugin-jsx-a11y@6.10.2` **is already installed**, transitively via
`eslint-config-next`, and six of its rules are already active through
`eslint-config-next/core-web-vitals`. But all six are **severity 1 (warn)**, and they are a thin
subset: `alt-text`, `aria-props`, `aria-proptypes`, `aria-unsupported-elements`,
`role-has-required-aria-props`, `role-supports-aria-props`. `npm run lint` therefore exits 0 today
with real accessibility defects present. Adopting the plugin's own recommended set at `error` is a
**configuration change, not a new dependency**.

Measured at `/spec` on 2026-08-19: running `jsx-a11y`'s recommended set **as its author wrote it**,
escalated to `error`, produces exactly **two violations repo-wide**, both at
`components/cart/CartDrawer.tsx:57` — the backdrop `div` carrying an `onClick` with no keyboard
path (`click-events-have-key-events`, `no-static-element-interactions`).

That number is the whole reason this part is affordable inside a combined slice, so the method
behind it matters. A first probe reported **143** violations and was **wrong**: it forced every rule
in the recommended config to `error`, including `label-has-for` (71 hits) and
`control-has-associated-label` (69 hits), which recommended explicitly ships as `"off"`.
`label-has-for` is deprecated in favour of `label-has-associated-control`, and both are known to
fire on correctly-labelled markup. **Turning them on is not part of this slice**; a requirement
built on that first number would have bought roughly 140 pointless edits and no accessibility.

**The limit of static linting — and why this part is not just a config change.** Reading
`CartDrawer.tsx` directly surfaced defects no lint rule here reports, because none can:

- The drawer is a modal with **no `role="dialog"`, no `aria-modal`, no accessible name**. To a
  screen reader it is an anonymous `div`.
- **No focus management at all** — focus is not moved in, not trapped, and not restored to the
  opener on close. Keyboard focus stays on the page behind the overlay.
- **No Escape-to-close.**
- Every control is **icon-only with no accessible name**: the close `X`, the `Plus`/`Minus`
  quantity steppers, and the `Trash2` remove button (which carries `title` — a tooltip, not a
  reliable accessible name).
- **Heading level skip**: the drawer header is `h2` and each item's name is `h4`, with the
  intervening `h3` present only in the empty state.

`components/consent/CookieBanner.tsx` is in materially better shape — it has an `aria-label`, a
semantic `aside`, and visible focus rings — and deliberately does **not** trap focus, which is
correct for a non-blocking banner.

**Colour contrast** is checkable without a browser: `design-system/tokens/tokens.css` is a flat
`@theme` block of literal hex values behind one layer of `var()` indirection, so a plain Node test
can resolve the semantic tokens and compute WCAG ratios directly.

Computing them at `/spec` produced the slice's most consequential finding: **three semantic tokens
fail WCAG AA in combinations the UI actually uses.**

| Pair | Ratio | AA normal text (4.5:1) |
|---|---:|---|
| `--color-action` `#4caf50` on white | 2.78 | fails — also fails the 3:1 UI threshold |
| white on `--color-action` | 2.78 | fails |
| `--color-accent` `#f57c00` on white | 2.70 | fails — also fails 3:1 |
| `--color-accent` on `--color-accent-tint` | 2.47 | fails |
| `--color-danger` on `--color-danger-tint` | 4.36 | fails |

These are not hypothetical pairings. Usage across `app/`, `components/` and `features/` is 17
`bg-action`, 15 `text-action`, 13 `text-accent` and 12 `border-action` — 45+ sites in 20+ files,
including `Header.tsx`, the storefront homepage, and product and category pages. The
danger-on-tint pair is the repo's **standard error-message treatment**, used at `text-sm` in
checkout, the account forms and `OrderStatusBadge` — the content that most needs to be readable.

**The fix is confined to the semantic layer.** `tokens.css` already separates primitives ("exact
Aheed brand-kit hex, do not use directly in components") from the semantic tokens components
actually read, and that separation is exactly what makes this cheap: changing five semantic values
fixes all 45+ sites with no component edits, and the brand primitives keep their brand-kit hex.
Approved at `/spec` on 2026-08-19:

| Token | Was | Now | On white |
|---|---|---|---:|
| `--color-action` | `#4caf50` | `#2e7d32` | 5.13 |
| `--color-accent` | `#f57c00` | `#a85400` | 5.34 |
| `--color-danger` | `#d32f2f` | `#c82d2d` | 5.43 |
| `--color-action-hover` | `#419544` | `#276a2b` | 6.60 (white on it) |
| `--color-accent-hover` | `#d06900` | `#8f4700` | 6.84 (white on it) |

All 17 pairs in R8 then pass at 4.5:1 with no exceptions and no large-text carve-out. The visible
effect is that the green and orange both read noticeably deeper.

**`--color-danger` was an extension beyond the two tokens originally put up for decision** — it is
included because the error-message pair sits at 4.36 and darkening it 5% clears it, and leaving the
one failing pair behind would have meant R8 needed a carve-out for the most safety-relevant text
on the site.

**Scope (Part A):**

- `eslint.config.mjs` adopts `jsx-a11y`'s recommended set at `error` for `app/`, `components/`,
  `features/` `.tsx`.
- **`components/cart/CartDrawer.tsx` was deleted, not fixed.** Build established it was dead code —
  added by P7a (`624a842`) and never imported by anything, with the live drawer being
  `components/cart/CartDrawerShell.tsx` that `Header.tsx` renders. Both of the two `jsx-a11y`
  violations were in it. The defects listed above were real, but in a component no user could
  reach; asserting accessibility against it would have been theatre. See the correction note in
  `requirements.md` Part A.
- `components/cart/CartDrawerShell.tsx` — which already had the ARIA half (`role="dialog"`,
  `aria-modal`, labelled close button, `aria-hidden` icons) — gains the keyboard half it lacked:
  focus into the panel on open, a `Tab`/`Shift+Tab` trap, focus restored to the cart button on
  close, `Escape`, and `aria-labelledby` pointing at its own heading.
- `components/consent/CookieBanner.tsx` was already correct on every count checked; its
  non-trapping behaviour is preserved intentionally and now pinned by a test.
- A DOM test environment is introduced (the repo has none — `vitest.config.mts` is
  `environment: "node"` with no testing-library and no jsdom) so the properties above are asserted
  by executed tests rather than by grepping source.
- The five semantic colour tokens above are darkened, `specs/design-system.md` records why, and a
  contrast test over `design-system/tokens/tokens.css` locks the result in.

## Part B — Row-level security determination (#220)

`specs/decisions/ADR-004-multi-tenancy.md` decision 2 defers RLS to P7, so the obligation is real
and already approved. **This slice specs it as a determination, not an implementation** — a call
made at `/propose` on 2026-08-19.

The reason is a specific technical doubt that has to be settled before any policy is worth writing.
RLS needs the current tenant communicated to Postgres per request, conventionally a session GUC set
via `SET LOCAL`. This app's primary client is `PrismaNeonHttp` (`lib/db.ts:12`) — stateless
`fetch`, one independent HTTP request per query, **no session for a GUC to live on**. The
WebSocket client (`PrismaNeon`, `lib/db.ts:23`) exists strictly for `$transaction`, and `CLAUDE.md`
is explicit that this split is deliberate: routing ordinary reads through WebSockets is what
exhausted the 50-socket isolate limit and caused #187.

So the honest outcome may be that per-request RLS is **incompatible with this stack as built**.
That is a genuine finding, not a failure to deliver — and the slice is specified so that recording
it counts as success. What is *not* acceptable is concluding it from reasoning alone: the
determination must rest on an executed experiment whose method and raw output are recorded, because
this is exactly the kind of claim a future session will otherwise re-derive from scratch.

If RLS is not adopted, a **compensating control must be concrete and in the repo** — an executable
check, not a paragraph promising vigilance. Today isolation rests on `lib/repositories/*` being the
only DB path plus an `eslint.config.mjs` `no-restricted-imports` rule. That is real but it is a
convention and a lint rule, which is precisely what decision 2 wanted backstopped.

**Scope (Part B):** run the experiment, record method and output, amend ADR-004 with the
determination, and land a compensating control if RLS is rejected. The existing repository-layer
enforcement and lint rule are **not** replaced whatever the outcome — RLS was only ever defence in
depth beneath them.

## Part C — Guest data rights (#222)

P7b (#216) gave account holders export, erasure and rectification at `/account/data`. A guest who
checked out without an account has none of it, and UK GDPR rights are not conditional on holding an
account.

**Two decisions this plan settles**, both listed as open on #222:

**1. Erasure only — not export.** Art. 15 (access) is already served for guests: `/orders/lookup`
renders the order's contents in human-readable form once the credential pair is proven. Art. 17
(erasure) has no route at all. Building a second machine-readable export for guests would widen an
already three-part slice to serve a right that is not currently unmet. Filed as **#253** (guest
machine-readable export) rather than lost.

**2. One order per request — the proof is not widened.** The credential is the order-number/email
pair, which proves control of *that order*. A guest with three orders repeats the flow three times.
Widening to "erase everything for this email" would mean acting on an email string alone, and P7a
already judged email insufficient proof of ownership because households share mailboxes — that
reasoning is why the lookup requires the pair plus a rate limiter in the first place. Accepting the
repetition is the cost of not weakening the proof.

**Reuse, don't reinvent.** `findOrderForGuestLookup` (`lib/repositories/orders.ts:1251`) already
matches vendor + order number + email **at the query level**, and `checkOrderLookupRateLimit`
(`lib/repositories/order-lookup-rate-limit.ts`) already throttles by hashed IP. Guest erasure sits
behind the same two.

**Erasure shape mirrors P7b's**, which is settled law in this codebase: the money survives, the
person does not. For a single guest order that means `Order.guestEmail` cleared, the `Address` the
order points at redacted in place (`Order.addressId` is not nullable), financial fields untouched,
and the whole thing inside a `$transaction` on `getPrismaWs()` — `PrismaNeonHttp` cannot run
interactive transactions, and a half-applied erasure is the one outcome with no recovery.

**Scope (Part C):** a guest erasure surface behind the existing credential pair and rate limiter,
the transactional erasure itself, and `/privacy` corrected so it stops describing a route guests
cannot use.

## Part D — `CLAUDE.md` repository-facade rule (wording only)

The rule added after P7b's `/fix` requires request-scoped facades to live in a sibling
`lib/<name>-service.ts`. **Nine facade factories across seven files violate it**
(`getCartRepository`, `getCategoryRepository`, `getDiscountRepository`, `getLoyaltyRepository`,
`getOrderRepository`, `getWebhookOrderService`, `getGuestOrderLookupService`,
`getProductRepository`, `getReviewRepository`); `lib/repositories/data-rights.ts` is the only
compliant file.

The rule also **contradicts itself**: it directs facades into a sibling file, then holds up
`getCartRepository` as the shape to match — while that function's own *location* is the violation.
A reader following the sentence literally reproduces the defect.

**This slice corrects the wording only** (`/propose`, 2026-08-19). The nine-factory move is tracked
as **#252**.

## Deliberately excluded

- **Moving the nine facade factories** (#252). A mechanical refactor across seven repository files
  and every call site, in a slice already carrying three parts.
- **Machine-readable guest export.** See Part C decision 1; a follow-up issue is filed.
- **Widening guest erasure beyond one order.** See Part C decision 2.
- **`jsx-a11y/label-has-for` and `control-has-associated-label`.** Off in the plugin's own
  recommended config; 140 combined hits on markup that is largely correct.
- **Accessibility remediation of the admin and staff surfaces.** The repo-wide lint gate covers
  them, but the hand-authored semantic work in Part A is scoped to the storefront components #217
  names. Admin forms are the larger surface and would dominate the slice.
- **A browser-driven axe or Lighthouse audit.** The repo has no browser test infrastructure; adding
  it is disproportionate here. Part A's assertions run in jsdom.
- **Implementing RLS policies if the determination rejects them.** See Part B.
- **#236 and #246** — moved to P8 at `/propose`. #246 needs live Cloudflare log-view access plus a
  driven traffic run, and #236 depends on its evidence.
- **#243 and #244** — board-phase P8, unchanged by this slice.

## Open items carried forward

- **#252** — the nine facade factories. Filed 2026-08-19, unscheduled.
- **#253** — machine-readable guest export. Filed at Build on 2026-08-19, unscheduled.
- **#46** — closed as housekeeping on this branch; P7d settled it and the code already shipped.
- **PR #250's roadmap change-log row** — `npm run sdd:audit` reports it pending carry-forward. A
  `/document` closeout PR cannot cite its own promotion, so it rides this branch (the #144 pattern).
