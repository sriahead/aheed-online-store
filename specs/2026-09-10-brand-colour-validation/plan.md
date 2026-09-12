---
id: brand-colour-validation-plan
title: "Brand-colour write validation and fail-safe render (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-09-10
visibility: internal
summary: Validate the eight VendorBranding hex columns on write, move the branding form to useActionState so a rejection renders against its field, and make brandStyle() fall back rather than throw on a malformed stored value.
tags: [branding, staff-panel, validation, accessibility]
---

# Brand-colour write validation and fail-safe render (plan)

**Goal:** close `#713` — make it impossible for a store admin to lock themselves (and their
shoppers) out of the site by typing a malformed colour into `/staff/storefront`, and make an
already-malformed stored value survivable rather than fatal.

## Why this is worse than a broken storefront

`lib/color-contrast.ts:43` throws on anything that is not a 6-digit hex:

```
if (!HEX.test(hex)) throw new Error(`not a 6-digit hex colour: "${hex}"`);
```

Nothing on the write path guards against that. `StorefrontConfigForm.tsx:198-203` renders the eight
`VendorBranding` primitives as free-text inputs; its `action` (line 84-111) forwards each as
`brandGreenDark || undefined`; `features/admin/storefront.ts:81` passes them through unchanged; and
`lib/repositories/vendor.ts:295` writes any truthy string (`if (value) brandingUpdates[field] = value`).
So `green`, `2e4d26`, `#2e4d2` and `rgb(0,0,0)` all save successfully.

`brandStyle()` is then called by **both** layouts — confirmed with `graft callers brandStyle`:
`components/layout/StorefrontChrome.tsx:31` and `app/(admin)/layout.tsx:41`. One bad value throws on
every page of that vendor's storefront **and** every page of the admin panel, including
`/staff/storefront` — the screen needed to correct it. Recovery today requires direct database
access.

The branding form is a real server action and is curl-drivable (CLAUDE.md records the exact wire
format), so a browser-side control alone would not close this.

## Scope (this slice)

1. **A pure validator module, `lib/brand-colour-form.ts`.** Same shape as the two modules already
   sitting beside it — `lib/delivery-rules-form.ts` (`#634`) and `lib/social-contact-form.ts`
   (`#407`/`#405`): `ParseResult<T>`/`FieldError` from `lib/catalogue-form.ts`, errors **returned,
   never thrown**, no DB and no request context. It also owns the `useActionState` state interface
   and its initial constant, because a `"use server"` file may export only async functions and a
   same-file value export makes every action in it fail at runtime (`#159`).

2. **Move the branding form to `useActionState`.** It is fire-and-forget `useTransition` today
   (`StorefrontConfigForm.tsx:62`, and its own comment at line 66 says so), which structurally
   cannot render a field error — the same reason `#634` gave the delivery-rules form its own action
   and `#407` gave the social one its own. `updateStorefrontConfig` has exactly one caller, so the
   signature change to `(prevState, formData)` is contained.

3. **A fail-safe in `brandStyle()`.** Any primitive that is not a valid `#rrggbb` is replaced with
   the corresponding value from `DEFAULT_BRAND_PRIMITIVES` (`lib/repositories/vendor.ts:74`) before
   any clamp runs, so the function cannot throw.

4. **Audit stored values in dev, staging and production**, across both `VendorBranding` (8 columns)
   and `Theme` (8 columns), and report the counts in `build-notes.md`.

## Why the fail-safe is in scope, when the issue listed only the audit

`#713`'s filed scope covers repair with a one-time audit. That covers today's rows and nothing else,
and the failure mode is a total lockout, so the cost of being wrong is asymmetric. The server action
is also not the only writer of these columns: `applyThemeToVendor` (`lib/repositories/vendor.ts:335`)
copies a `Theme`'s eight values across, `prisma/seed.ts` writes them directly, and a future migration
could too. Validation on write cannot see any of those paths. The fallback is a few lines in a pure
function that is already unit-tested, and it is what turns "we checked, and we'll check again" into
a property that holds.

**The sanitisation has to run on the whole `BrandPrimitives` bag on entry, not per output token.**
`brandStyle()` passes the vendor's own `cream` and the three tints into `clampForContrast` as
*backgrounds* (`lib/vendor-theme.ts:112-127`), so a malformed tint throws from inside the clamp
rather than at assignment. Sanitising only the values that appear on the left-hand side of the
returned object would miss that.

## The `#251` trap, and how validation avoids repeating it

`brandStyle()`'s return value is an inline style on the root element, so it outranks
`design-system/tokens/tokens.css` on specificity. In P7 closeout (`#251`) a token change landed
cleanly in `tokens.css`, its contrast test passed, and **every real page kept serving the old
AA-failing hex**, because this function re-declares those tokens per vendor. The jsdom test could
not see it. `CLAUDE.md` is explicit: any change here must be verified against live rendered output
for **both** vendors, not against a unit test. `validation.md` does that, and reads the vendor
hostnames from `VendorDomain` rather than assuming them — a spec that hardcoded
`srimart-staging.nocaped.com` silently redirected to `/coming-soon` for the session that ran it
(`#649`).

## Deliberately excluded

- **No schema change.** The eight columns stay `String`. A Postgres `CHECK` constraint or a domain
  type would be a defensible alternative; it is not this slice, and it would not remove the need for
  a returned field error.
- **No colour pickers and no contrast preview** — that is `#714`, the follow-up slice, which wants
  this one landed first so the picker is safe to add.
- **No theme architecture change and no new predefined themes.** `applyThemeToVendor` is not given
  its own validation pass: `Theme` rows are seeded, the audit covers them, and R6's fallback covers
  a bad one at render time regardless.
- **No change to the contrast machinery itself.** `clampForContrast`/`darkenForHover`/
  `mutedForeground` already hold WCAG AA and are not touched. This slice is only about a malformed
  value reaching them.
- **No repair script for an already-bad row.** The audit reports; if it finds nothing, there is
  nothing to repair, and R6 means a future bad row degrades instead of bricking. If the audit finds
  something, that becomes its own tracked issue rather than unscoped work here.
- **`bannerNote` and `heroSubtitle`** move to the new action alongside the colours because they
  share the form, but gain no validation of their own — they are free text today and stay so.

## Open items carried forward

- **`#714`** — colour pickers with a preview of the clamped colour that actually renders. Depends
  on this slice.
- **Staging and production audit results are not knowable until the slice runs.** If either holds an
  invalid value, R9 records it and a repair is filed separately.
