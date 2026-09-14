---
id: p10-fulfilment-config-and-checkout-fixes-plan
title: "P10 — Fulfilment configuration and checkout fixes (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-14
visibility: internal
summary: "Gives #401/#402 the staff configuration surface they shipped without (#750), moves the checkout postcode lookup server-side and fixes the form it writes into (#749), and makes the vendor logo upload report why it fails — which is how its cause, rejected R2 credentials, was found."
tags: [p10, fulfilment, slots, express, checkout, storage, admin]
related: [roadmap, architecture, claude-md]
---

# P10 — Fulfilment configuration and checkout fixes (plan)

**Goal:** remove the two remaining owner-reported defects blocking the `staging → main` promotion.
`#750` is the hard blocker: `#401` (delivery slots) and `#402` (express collection) shipped their
models, checkout UI and capacity logic with **no administrative surface and no seed data**, so
neither feature can be switched on or configured by anyone. `#749` is the pair of checkout/admin
defects found alongside it. Shipping this slice means the promotion hold can be reconsidered on its
merits rather than being held by a feature that provably cannot work.

## Part A — #750, the fulfilment administration surface

**This repository has already solved this exact shape of defect once.** `/staff/delivery-areas`
(#612) was built because `VendorDeliveryArea` gated checkout and its only writer anywhere in the
repository was `prisma/seed.ts`. `VendorFulfilmentSlot`, `VendorExpressSchedule` and four
`VendorConfig` columns are in that same position today, verified against the tree: they appear in
**no** file under `components/staff/`, `app/(admin)/`, `features/admin/` or `prisma/seed.ts`. So
this part is a deliberate pattern-copy of #612, not a fresh design.

**Scope (this slice):**

- A new `/staff/fulfilment` page (`app/(admin)/staff/fulfilment/page.tsx`), ADMIN-gated via
  `requireVendorRole("ADMIN")`, whose refusal branch renders `<PanelRefusal>` — never a bare
  `return null`, which `app/(admin)/layout.tsx` would serve as a 200 with a blank content area.
  Modelled on `app/(admin)/staff/delivery-areas/page.tsx`.
- Three sections on that one page:
  - **Fulfilment settings** — `offerDeliverySlots`, `expressCollectionEnabled`,
    `bookingWindowDays`, `slotHoldDurationMinutes`.
  - **Weekly slots** — `VendorFulfilmentSlot` rows: `method` × `dayOfWeek` × `startTime`/`endTime`
    × `capacity`.
  - **Express windows** — `VendorExpressSchedule` rows: `dayOfWeek` × `openTime` × `closeTime`.
- Write functions added to `lib/repositories/fulfilment-slots.ts` (today read-only, 78 lines),
  each taking `prisma` and `vendorId` as explicit parameters and reading no request context; the
  request-scoped facade goes in the existing `lib/fulfilment-slots-service.ts`.
- Server actions in `features/admin/fulfilment.ts`, each running its own
  `requireVendorRole("ADMIN")` rather than trusting the page that rendered the form — a server
  action is a public endpoint at a stable id. Parse helpers and the `useActionState` seed constant
  live in a plain `lib/fulfilment-form.ts`, because a `"use server"` file may export only async
  functions and the restriction is enforced at runtime, not build time (#159).
- The three surfaces a new `/staff/*` page must reach: `components/staff/PanelNav.tsx`, the hub
  cards in `app/(admin)/staff/page.tsx`, and a documented section in
  `docs/store-admin-guide/admin-tabs-guide.md` carrying the seven labelled parts and a
  `Who can access` line matching the page's real gate.
- `prisma/seed.ts` authors example weekly slots and express windows for the seeded vendors and
  enables both flags, so a seeded environment demonstrates the feature without manual data entry.

**Why the four config fields sit on the new page rather than `/staff/storefront`.** `#750`'s own
issue body proposed extending `lib/delivery-rules-form.ts` and `updateDeliveryRules`. That reuses a
proven path, but `bookingWindowDays` and `offerDeliverySlots` are meaningless without the slot rows
they govern, and `components/staff/StorefrontConfigForm.tsx` is already 702 lines. Putting the
switch next to the thing it switches keeps one operational concern on one screen. This is a
deliberate departure from the issue body, recorded here so it is not read as an oversight.

**Why the validation is load-bearing rather than cosmetic.** `startTime`/`endTime` are plain
`String` columns that feed `getAvailableSlotsForDate`'s comparisons, and `capacity` is the actual
overbooking guard — `lib/repositories/orders.ts:166` counts orders placed inside the
`slotHoldDurationMinutes` window against it. A malformed `HH:mm`, an inverted range, or a zero
capacity each produces a slot no customer can ever book, silently: the same invisible failure mode
this slice exists to remove.

## Part B — #749, the checkout postcode lookup

Two distinct defects in one code path, both confirmed by reading the deployed code and the live
response headers:

1. **It is blocked by CSP and always has been.** `components/checkout/CheckoutForm.tsx:84` calls
   `lookupPostcode` from a client component, so the `fetch` to `api.postcodes.io` runs in the
   browser. Staging's live header is `connect-src 'self' https://*.r2.cloudflarestorage.com`, so
   the request never leaves the page — and the `catch` treats the failure as a 5xx/timeout and
   swallows it with `console.warn`. `#613`'s address lookup has therefore never worked in any
   deployed environment.
2. **It writes into the wrong form.** The success path does `document.querySelector("form")` and
   writes `city`/`county` into whatever the **first** `<form>` in the document happens to be. Since
   `#748`, the fulfilment-method form renders above the address fields, so even with a working
   fetch the looked-up values would land in the wrong element.

The fix moves the call behind a server action rather than widening CSP. `api.postcodes.io` needs no
key and returns public data, so a permanent hole in `connect-src` buys nothing that a server action
does not, and the server-side call also removes the shopper's browser from the dependency. The DOM
write is re-scoped to the address form specifically.

This also resolves **#751** as a direct consequence: `tests/postcodes-api.test.ts` reaches the real
public internet and flakes the full suite (it failed `#748`'s own full-suite run with
`PostcodeApiError: This operation was aborted` and passed in 907ms alone).

## Part C — #749, the vendor logo upload

**The root cause was found during this Spec stage, and it is not what the issue assumed.** The
handoff had ruled out R2 CORS, CSP and server-side throws, and named a browser reproduction with
DevTools as the next step. A browser was not needed: `lib/storage.ts` imports only `aws4fetch` and
`lib/config`, so the whole path runs in plain Node. A scratch script (written, run, and deleted —
it is not part of this slice's deliverable) reproduced the failure immediately and then bisected it:

| Probe | Result |
| --- | --- |
| Presigned PUT exactly as `VendorLogoUploader` sends it | `403 SignatureDoesNotMatch` |
| Presigned PUT with no `Content-Type`, with/without a preset `X-Amz-Expires`, with `content-type` unsigned | `403` every time |
| `putObject` — **header**-signed, the path `prisma/seed.ts` uses | `403` |
| Presigned **GET** | `403` |
| Read-only `HEAD` of a non-existent key, dev / staging / production | **`403` in all three** |

Every variant fails, including the plainest possible presign and a header-signed write, so this is
not the signing options, the content type, or `aws4fetch`. All three environments carry the
**identical** S3 key pair (same access-key and secret fingerprints; only `S3_BUCKET` differs), and
R2 rejects it everywhere. **The R2 S3 credential pair is invalid — almost certainly revoked or
rotated without `.env`, `secrets/staging.vars`, `secrets/production.vars` and the Cloudflare Worker
secrets being updated.** That matches the rotation-drift shape already recorded for Neon passwords
and tracked for the Cloudflare API token in `#219`.

**The blast radius is far wider than "the vendor logo upload fails."** `publicUrl` is pure string
composition over `CDN_BASE_URL`, so shopper-facing image *display* is untouched — which is exactly
why this went unnoticed. Every other `getStorage()` caller is an S3 API call in a staff/admin write
path, and all of them are equally broken in all three environments: product images
(`features/admin/product-image.ts`), bundle images, campaign banners and the AI campaign-image
route, the vendor logo, and `lib/product-image-pipeline.ts`.

**Rotating the credential is a human action this slice cannot perform** — `CLAUDE.md`'s hard stop
is explicit that missing credentials get listed, never invented. What this slice does instead is
make the class of failure diagnosable in one command instead of several weeks:

- `components/staff/VendorLogoUploader.tsx:74` currently reads
  `setError("The upload was rejected by storage (\).")` — a corrupted template literal that
  discards `put.status`. It is the only one of the repository's four uploaders that cannot report
  why it failed, which is precisely why this was unreportable. Fixed, and its unguarded `fetch`
  inside `startTransition` wrapped so a network throw surfaces as a message rather than a swallowed
  rejection.
- A committed `scripts/verify-storage-credentials.ts`, matching the existing `scripts/verify-*.ts`
  precedent, that reports per-environment credential validity **read-only** (a `HEAD` for a key
  that does not exist: `404` proves the credential works, `403` proves it does not). No writes to
  any environment.

**Scope boundary for Part C:** the code changes above, plus a filed issue for the rotation itself
with the exact steps. The rotation is not performed here.

## Deliberately excluded

- **Performing the R2 credential rotation.** It needs a new Cloudflare R2 API token, four secret
  stores updated (`.env`, `secrets/staging.vars`, `secrets/production.vars`, plus
  `wrangler secret put` for each Worker environment) and a redeploy. Owner action; tracked by its
  own issue.
- **Widening CSP to allow `api.postcodes.io`.** Rejected in favour of the server action, above.
- **Any change to `SlotPicker.tsx` or `CheckoutForm.tsx`'s slot rendering.** `#401`/`#402` built
  those and they are correct; they have simply never had data or an enabled flag to render. This
  slice supplies both and changes neither.
- **A capacity or rounds model beyond the per-slot `capacity` integer already in the schema.** The
  discovery log's 2026-09-02 finding asks Aheed for van count and round size before anything richer
  is designed; that question is still open and is not answered here.
- **`#363` (vendor timezone).** `#401`/`#402` shipped without it, recorded as known-shaky. Slot
  times remain UK-local. Unchanged by this slice.
- **`#753`** (a live-browser check of `#748`'s R14/R18). Separate issue, separate surface.
- **Wiring `scripts/verify-storage-credentials.ts` into CI.** It exits non-zero while the
  credentials are rejected, which is the whole point of it — adding it to `quality.yml` today would
  fail every build until the rotation happens, and `quality.yml` carries no S3 secrets anyway. It is
  a command a human runs, not a gate.
- **Retro-fitting the other three uploaders' error reporting.** Only the logo uploader's message is
  actually corrupted; the other three already report their status. Once the credential is rotated
  they should all work, and changing four files to prove one hypothesis is scope creep.

## Open items carried forward

- **The R2 credential rotation** — every staff image upload in every environment stays broken until
  it happens. This slice makes it visible and one command away from confirmation; it cannot fix it.
- **`prisma/seed.ts` cannot currently complete a full run against an unseeded database**, because
  its `putTracked` image uploads call `putObject`, which now returns `403`. The slot/express seed
  data added here touches no storage and so is unaffected on an already-seeded database, but a
  from-scratch seed is blocked on the rotation above. Stated so a validator does not read it as a
  defect in this slice.
- **Whether the CDN read path is genuinely unaffected was not verified in this session** — two
  attempts to fetch a known image key from the staging and production CDN hosts failed with local
  curl transport errors (`exit 35`/`43`), not HTTP responses, while plain `/api/health` calls to
  the same domains succeeded. The reasoning that reads are unaffected rests on `publicUrl` being
  pure string composition, which is verified in code; the live confirmation is not.
