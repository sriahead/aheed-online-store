---
id: social-contact-surface-plan
title: "Social & contact surface — Facebook, Instagram and WhatsApp deep link (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-10
visibility: internal
summary: Three nullable VendorConfig fields put per-vendor Facebook, Instagram and WhatsApp links on the storefront, with a null hiding its link rather than borrowing another vendor's identity.
tags: [storefront, multi-tenancy, vendor-config, accessibility]
---

# Social & contact surface — Facebook, Instagram and WhatsApp deep link (plan)

**Goal:** give each vendor a real contact and social presence on its own storefront, driven entirely
from its own data, so Aheed can point customers at its Facebook and Instagram pages and offer
one-tap WhatsApp contact — without any vendor ever rendering another vendor's identity. Shipping
this closes `#407` and the small half of `#405`.

## Scope (this slice)

**Three nullable columns on `VendorConfig`** (`prisma/schema.prisma`), added by one additive
migration:

- `facebookUrl String?` and `instagramUrl String?` — full profile URLs.
- `whatsappNumber String?` — digits only, E.164 without the leading `+`, because `wa.me` takes a
  bare number rather than a URL.

They are **not uniform** despite being "three nullable fields": two are URLs and one is a phone
number, so they validate and render differently.

**The `#239` rule applies to all three.** A `null` HIDES its element. It never falls back to a
platform default, because a platform-written social link is a claim made on a vendor's behalf —
exactly what `#239` fixed when Aheed's halal marketing copy was rendering on SriMart. The existing
`bannerNote`/`heroSubtitle` pair in the same model is the precedent being followed, and
`lib/repositories/vendor.ts`'s `VendorProfile` already carries that rule in its own doc comment.

**Read path.** `fetchVendorProfile` (`lib/repositories/vendor.ts:L79-L153`) selects the three
columns and projects them onto `VendorProfile`, defaulting to `null` — matching how `bannerNote`
and `heroSubtitle` are already handled there, and deliberately unlike `deliveryFeePence`, which
falls back to a schema default.

**Render path.** `components/layout/StorefrontChrome.tsx` already renders the footer
(`L32-L48`) and already receives `profile: VendorProfile`, so both surfaces mount there:

- **Social links in the existing footer**, beside the Terms/Privacy links, using `lucide-react`
  (already a dependency at `^1.30.0` — `#407` explicitly asks for no new icon package).
- **A floating WhatsApp deep link** to `wa.me`, with a prefilled message.

**Write path.** `/staff/storefront` — the screen `#278` added — gains a third form, alongside the
branding form and `#634`'s delivery-rules form. It uses `useActionState` like the delivery-rules
form rather than the branding form's fire-and-forget `useTransition`, because an invalid URL must
render an error against the field that caused it.

**Validation lives in a pure module**, `lib/social-contact-form.ts`, following
`lib/delivery-rules-form.ts` (`#634`) and `lib/catalogue-form.ts`: DB-free, session-free,
unit-tested, returning errors rather than throwing.

## Why the URL validation is load-bearing

These are the first vendor-editable values in this repo that land directly inside an `href`.
A stored `javascript:` URL becomes a live script link for every visitor to that storefront, so the
accepted shape is an **https-only allow-list**, not a "looks like a link" check. `http:` is refused
too — a mixed-content link from an HTTPS storefront is both a downgrade and a warning in the
browser. The check is applied on write *and* the render stays defensive, so a row written before
this validation existed cannot fire either.

This mirrors why `#634`'s delivery-rule validation is strict: making a column admin-writable for the
first time means a bad value can now exist where previously only `prisma/seed.ts` could write one.

## Where the floating button actually goes

`components/cart/CartDrawerShell.tsx:L113` already renders a floating cart button at
`fixed bottom-6 right-6 z-50` (`sm:bottom-8 sm:right-8`), mounted through `Header.tsx:L308`, and it
is **unconditional** — only its item-count badge is conditional, so it is present on every
storefront page including an empty cart. `components/consent/CookieBanner.tsx:L31` is a second fixed
element, `fixed bottom-0 inset-x-0 z-50`.

So the WhatsApp button is **stacked above the cart button on the same side** rather than placed at
`bottom-right`, which is where a WhatsApp button conventionally goes and is already taken. The cart
stays closest to the thumb because it is the primary commerce action.

`#405` asks for a position that avoids "the sticky bottom nav or the cart drawer". **There is no
sticky bottom nav in this repo** — `CollectionNav` is a collections strip and `PanelNav` is
staff-only — so that half of the constraint is stale and only the cart button and cookie banner are
real. This is recorded here so the next reader does not go looking for a component that does not
exist.

## Deliberately excluded

- **`#405`'s second half — instant re-order through WhatsApp chat.** Split to `#695`: it needs a
  Meta Business account, a verified business, an approved message template, a BSP/Cloud API
  integration and an inbound webhook, plus a data-protection answer for authenticating a shopper
  over chat. That is a new channel, not a storefront feature.
- **A per-vendor prefilled message template.** The `wa.me` message is derived from the vendor's own
  name in code. Making it editable is a fourth column and a fourth form field for no demonstrated
  need; it can be its own issue if an operator asks.
- **Seeding any real handles.** `prisma/seed.ts` is unchanged and both vendors start `null` for all
  three. We hold no real Facebook, Instagram or WhatsApp identity for either vendor, and inventing
  one would breach `CLAUDE.md`'s "never invent infrastructure or credentials". The useful
  side effect is that the default state *is* the null-hides path, so `#239`'s rule is exercised by
  the seed rather than only by a test.
- **A dismissible WhatsApp button.** `#405` asks for "a dismissible/accessible control"; this slice
  delivers the accessible half and not the dismissible half. Dismissal needs a client component and
  a persistence decision nobody has made (per-session, per-device, or per-account), and the adjacent
  floating cart button — larger, equally permanent, on every page — is not dismissible either, so
  dismissing only this one would be inconsistent. Raised here rather than dropped silently; if the
  owner wants it, it is a small follow-up issue rather than a change to this slice's shape.
- **WhatsApp's own brand green.** The button uses the vendor's semantic tokens, so it renders in
  Aheed's green and SriMart's blue rather than `#25D366`. A raw hex literal in a component would
  break this repo's design-token convention, and a per-vendor storefront rendering a third party's
  brand colour in its own chrome is the same category of mistake `#239` fixed.
- **Mega-menu and bottom-nav placement.** `#407` mentions these as optional "when those land". They
  have not landed.
- **`X`/`TikTok`/`YouTube` or any fourth network.** Two networks were asked for.
- **Analytics on link clicks.** No third-party script is introduced by this slice, which is what
  keeps it clear of the CSP and consent constraints `#407` notes.

## Open items carried forward

- **`#695`** — WhatsApp chat re-order (the API/approval half).
- **`#405` stays open** after this slice: its floating-button half ships here, its chat half is
  `#695`. Only `#407` is closed by this PR.
- **The MVP scope reversal must be recorded.** The mission document lists WhatsApp among
  out-of-scope items. `#405` asks for that reversal to be recorded consciously in
  `specs/roadmap.md` rather than left to drift; that is a Document-stage deliverable, captured as
  R14 so it cannot be forgotten.
