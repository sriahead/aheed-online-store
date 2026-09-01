---
id: admin-alert-and-local-vendor-host
title: "A blocking admin alert, and a second local vendor unreachable by host (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-01
visibility: internal
summary: Two small fixes filed from earlier validation passes — the admin backfill button reported through a native alert() that froze the tab, and a VendorDomain row carrying a port could never resolve under local preview.
tags: [admin, a11y, multi-tenant, developer-experience]
related: [roadmap, architecture, adr-004-multi-tenancy]
---

# A blocking admin alert, and a second local vendor unreachable by host (plan)

**Goal:** close two small defects that each made something *unverifiable*, so the next validation
pass over either area can actually be run.

Issues **#507** and **#514**. Both were filed *from* `/validate` passes — for `#502` and `#501`
respectively — where they obstructed the verification rather than the feature. They are unrelated in
subject and grouped only because each is a few lines and would otherwise carry a whole slice's
overhead, matching the existing debt-bucket precedent (`specs/2026-08-17-catalogue-debt-bucket/`).

## #507 — a native `alert()` froze the tab

`components/staff/BackfillImagesButton.tsx` reported its result with `alert(...)`, present since
`#304`. A native alert blocks the whole tab until dismissed: an operator gets a modal in the way of
a background job's result, and **browser automation freezes outright** — CDP calls, screenshots and
even closing the tab hang until a human clicks it, with no way to script around it.

So the one admin control that triggers a paid, long-running job was the one control no automated
check could exercise end to end. It was also the *only* `alert()` in the admin panel; every other
action already reports inline, so this was a lone exception rather than a house style.

**The fix is an inline result** matching `BundleForm`'s existing `role="alert"` / `role="status"`
pair. Two details worth stating: a non-OK response reads the route's **`error`** field rather than
`message`, because that is what `requireVendorRole`'s 401/403 returns and reading `message` would
render `undefined` to an operator refused for the wrong role; and the button re-enables afterwards
so a second attempt needs no reload.

## #514 — a second vendor was unreachable locally

`getCurrentVendorIdOrNull` resolves the request host through
`splitHostPort(rawHost).hostname`, which **always** strips the port before looking up
`VendorDomain.host`. That is correct for every real deployment — `nocaped.com` and
`staging.nocaped.com` never carry a port — but under `npm run preview` a second vendor lives at
`srimart.localhost:8787`, and a row seeded with that literal string (the natural value, since it is
exactly what the browser sends as `Host`) could never match. The request fell through to the
"no match, 2+ active vendors" branch and redirected to `/coming-soon`, with nothing to say why.

`#501`'s validation worked around it by rewriting the row by hand — a data change, not a fix.

**The fix is a fallback lookup on the raw host**, taken only when the raw host differs from the
port-stripped one. The issue offered two routes and this is the second; the first (seed local rows
without the port and document the convention) is cheaper but leaves the database holding a value
that does not match what a browser actually sends, which is a trap for anyone reasoning from the raw
table.

**The guard is the important part.** `getCurrentVendorIdOrNull` runs on **every request**, so the
risk in touching it is cost, not correctness. Guarding on `rawHost !== host` means a portless host —
every real deployment — issues exactly the one query it always did, and the test asserts the call
count rather than just the result.

## Scope (this slice)

- `components/staff/BackfillImagesButton.tsx` — inline result state, no `alert()`.
- `lib/tenant.ts` — the guarded ported-host fallback, lower-cased to match how
  `upsertVendorDomain` stores rows.
- `tests/backfill-images-button.test.tsx` (new) and three cases in `tests/tenant.test.ts`.

## Deliberately excluded

- **A toast system.** `#507` offers "inline result or a toast"; the panel has no toast primitive and
  introducing one for a single button is a design decision, not a bug fix.
- **Any other change to tenant resolution** — the loopback special case, the single-vendor fallback,
  and `isCanonical` handling are untouched.
- **Seeding local `VendorDomain` rows differently.** With the fallback in place both spellings
  resolve, so no convention needs to change and no existing row needs rewriting.
- **`@testing-library/jest-dom`.** Not a dependency here; the new component test uses plain DOM
  assertions rather than adding one for a single matcher.

## Open items carried forward

- **`#364`** (PNG bytes under a `.webp` key) and **`#511`** (shop-row scrollers) remain open; #511
  in particular still needs a page-cost decision about row width that this slice does not make.
- The six S3/CDN secrets for the `production` GitHub environment, outstanding from `#518`.
