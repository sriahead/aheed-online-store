# P6.5 residual validation & gap-register reconciliation (build notes)

## What changed and why

**One master gap register.** `docs/gap-register.md` now holds all fifteen rows (GAP-001..015) and
`docs/sdd/self-review/GAP-REGISTER.md` keeps its P6.5 narrative with its table replaced by a
relative link. Two `status: approved` files were sharing one GAP-ID space with no cross-reference,
so no single place answered "what is the state of this application's known gaps?".

**Every row re-derived from the code.** The audit found the registers wrong on **seven of fifteen**
rows — two more than the five identified while drafting the spec:

| GAP | Was | Is | Basis |
|---|---|---|---|
| GAP-007 | cites #167 | cites **#180** | #167 is the closed P6b2 upload slice; #180 is the open CORS prerequisite |
| GAP-008 | Deferred | Fixed | shipped in P7a, corrected in PR #204; #123 closed |
| GAP-009 | Deferred | Fixed | `components/cart/CartDrawer.tsx` mounted from `components/layout/Header.tsx` |
| GAP-010 | Deferred | Fixed | `features/orders/advance-status-bulk.ts`, PR #204; #162 closed |
| GAP-012 | Deferred | Fixed | **found already built** — see below |
| GAP-013 | Deferred | Fixed (partial) | rail ships, but on an `isHalal` proxy; **#208** filed |
| GAP-014 | Deferred (wording) | Deferred (corrected wording) | multi-image *storage* exists; remove/reorder do not |

**GAP-012 is the notable one.** `features/orders/reorder-items.ts` is a complete `"use server"`
action wired into a real `<form action={reorderItems}>` at
`app/(storefront)/account/orders/[orderNumber]/page.tsx:45`, while both the register row and issue
**#124** still reported the feature outstanding. This is the mirror image of GAP-010: not work
claimed-but-missing, but work delivered-and-forgotten. Nothing in the previous process could catch
either direction, because nothing compared a row to the code.

**P6.5's exit gate rewritten.** `specs/2026-08-13-p6.5-self-review-hardening/requirements.md` had no
numbered requirements at all (prose Objectives/Exit Criteria) while its `validation.md` verified
rows labelled `R1..R6` that corresponded to nothing. Two of those rows were satisfied by a document
asserting something about itself. Now `R1..R11`, each row naming a command, a file property, or a
behaviour.

**#176 closed on real evidence**, and `specs/sdd-workflow.md`'s Validate-stage paragraph rewritten —
see "Decisions" for why that paragraph was worse than merely stale.

**Carry-forward:** the PR #206 promotion row in `specs/roadmap.md` (fifth consecutive miss; the
tooling gap is now **#207** rather than a sixth prose observation).

## Decisions taken during the build

**Verifying #176 without handling a credential.** The reported symptom needs a sign-in, but CSRF
origin validation runs *before* credential checking — so a deliberately wrong password separates the
two failure modes cleanly and no real password is ever needed. Recorded here because it is reusable:
any future origin/CSRF row can be proven this way.

Headless, against `npm run preview`:

| `Origin` | Result |
|---|---|
| `http://localhost:8787` | `401 INVALID_EMAIL_OR_PASSWORD` — origin accepted |
| `http://localhost` | `403 INVALID_ORIGIN` — correctly refused |

Real Chrome on `/login` with a deliberately invalid password: `POST /api/auth/sign-in/email` → **401**.
Corroborated server-side in the wrangler log (lines 167, 168, 222).

**The workflow paragraph was inverted, not just stale.** `specs/sdd-workflow.md` told readers that
`Origin: http://localhost:8787` gets `403` and the port-less origin gets `200`. Today it is exactly
the other way round, because the fix made the port-ful origin the trusted one. A validator following
that text would have concluded a working app was broken. It was rewritten to state current
behaviour, name the inversion, and drop the instruction to apply an **uncommitted** patch to
`lib/auth-origin.ts`.

**GAP-013 marked `Fixed (partial)` rather than `Fixed` or `Deferred`.** The rail ships and #45 is
closed, so `Deferred` is false; but `app/(storefront)/page.tsx:28` populates it with
`productsRepo.search("", { take: 4, isHalal: true })` — annotated in that file as "simulated deals /
halal featured" — and `Product` has no featured flag. Neither existing status was honest, so the
remainder went to **#208** and the row says what is actually true.

**Removed the register's self-assessment rather than restating it.** The "Final Production
Readiness Recommendation" asserted "0 P0 (Critical Code/Security) gaps" and "100% functionally
complete, fully tested, and verified" on 2026-08-13 — the same day P7a shipped an unauthenticated
cross-vendor order-disclosure hole that PR #204 had to fix, and with GAP-010 unbuilt. A readiness
percentage that nothing measures is the thing being corrected, so it was deleted rather than
re-scored.

**Cookie banner accepted via "Essential Only"** rather than "Accept All" — the privacy-preserving
option, and it exercises the same cookie-setting path. "Accept All" was therefore not exercised.

## Deviations from the spec

**R21's email-dispatch outcome is recorded as inferred, not directly observed.** The requirement
asks whether dispatch "succeeded or failed with which error". `lib/email.ts` logs on both failure
paths (`email send skipped` at line 18, `email send failed: <status> <body>` at line 34) and
**neither line appeared**, with the action completing `200 OK` in 890ms — consistent with a
successful Resend API call. That is the strongest available evidence, but it is absence-of-error
plus timing, not a captured success response. Inbox delivery was neither confirmed nor confirmable:
the recipient is a reserved `example.com` address, and Resend still has no verified sending domain
(**#104**).

**GAP-012 was live-verified after all**, going slightly beyond what the spec required. R5 forbids a
`Fixed` row citing an open issue, so marking GAP-012 `Fixed` forced the question of whether #124
could honestly be closed. Rather than weaken either the row or the requirement on code-inspection
evidence, the feature was exercised: signed in as `demo-staff`, **Reorder items** on cancelled order
`AHE-20260817-3V492G` redirected to `/cart` holding exactly that order's line
(`5 × Kitchen Roll, pack of 4`, `£16.45`). #124 closed on that evidence. Noted because R5 turned out
to do real work here — it converted a documentation decision into a testable one.

Otherwise none.

## Known-shaky areas

**Ref-based clicks silently no-op'd three times** in this browser session (`ref_18` on the cookie
banner, `ref_9` and `ref_8` on submit buttons) — the tool reported "Clicked on element" each time
while the page state was unchanged. Coordinate clicks worked every time. Any future browser-driven
validation should assert the resulting state rather than trusting the click's return value; two of
these would have read as "the feature is broken" if the page hadn't been re-checked.

**The audit's coverage is per-row, not exhaustive over the codebase.** It proves each of the fifteen
recorded rows now matches the code. It does **not** prove there is no eighth unrecorded gap — that
would be a fresh self-review, which is P6.5's job, not this slice's. GAP-012 having gone unnoticed
for weeks is the honest indicator of how much is found only when someone looks.

**`.env` and `.dev.vars` both carry two spaces after `=` on several keys** (e.g.
`DATABASE_URL=  "postgres…"`). This currently works, but `CLAUDE.md` warns against spaces around `=`
and #156 was a real breakage from exactly that shape in `secrets/production.vars`. Not touched here —
out of scope, and the files are gitignored — but worth a look before it bites a third time.

**Test residue left on staging.** The live checks changed staging data deliberately: order
`AHE-20260814-VZ68SL` is now `DELIVERED` (was `OUT_FOR_DELIVERY`) with a real `OrderStatusEvent` row,
and `demo-staff`'s cart holds 5 × Kitchen Roll from the reorder check. Both are demo-account data on
a demo vendor and are harmless, but they are real writes, not fixtures — worth knowing before
someone reads those rows as seed state.

**#192's item 4 is only partly discharged.** P7a's `validation.md` was effectively walked by PR #204
and P6.5's is now rewritten and re-run, but **P6.6 and P6.6c never got their own per-slice walks**.
No discrepancy in the register pointed at them, so no spot-check was triggered. #192 stays open with
that item named explicitly.
