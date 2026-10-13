---
id: p1069-brand-assets-plan
title: "Per-vendor brand assets: square mark, icons, social image, responsive header mark (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-12
visibility: internal
summary: "Adds a per-vendor square mark to VendorBranding. From one upload it produces favicon, apple-touch, manifest and social-share images, and the header shows the mark on phones."
tags: [branding, multi-tenancy, icons, metadata, header, p10]
related: [design-system, adr-003-storage-abstraction, adr-004-multi-tenancy, discovery-log]
---

# Per-vendor brand assets (plan)

Issue **#1069**, from the tenth Discover pass (2026-10-12, `docs/research/discovery-log.md`).
**Gate 1 was approved on 2026-10-12** for the full slice. The approved scope is in the issue
comment, and the owner removed the SriMart palette item the same day. `requirements.md` holds the
checkable criteria; this file holds the reasoning.

**Goal:** every vendor can upload one square **mark**. From that single upload the platform
produces:

- the browser-tab favicon;
- the iOS home-screen icon;
- the Android/PWA manifest icons;
- the image a shared link previews with (WhatsApp, Facebook, iMessage);
- the logo shown in the header on a phone.

All of it is per vendor and comes from the database. None of it comes from `public/`, which every
vendor shares (ADR-004).

## Why

As observed on 2026-10-12, no vendor has any of these:

- `app/manifest.ts` returns `icons: []`;
- there is no `app/icon.*`, `apple-icon.*`, `favicon.ico` or `opengraph-image.*`;
- `generateMetadata()` in `app/layout.tsx` emits neither `icons` nor `openGraph`.

`VendorBranding` has one image column, `logoStorageKey`. The header renders that logo in a fixed
72×40 box (`aspect-9/5 object-contain`). The box is reserved that way by #329 and #655 so the
header never shifts. A wide lockup in that box becomes unreadable on a phone.

Aheed is about to adopt a new logo. Its designer will supply a lockup and a monogram "A". This slice
gives the monogram somewhere to go. The platform work is tested with a neutral placeholder fixture,
because the real artwork does not exist yet.

## Scope (this slice)

### 1. Schema

Add `VendorBranding.markStorageKey String?`. It is nullable, its migration is additive, and there
is no backfill. It holds the **relative key of the 512 px PNG**:
`vendors/{vendorId}/mark-{uuid}/512.png` (ADR-003: a key, never a URL).

The other four files sit beside it in the same folder under fixed names:

- `32.png`
- `180.png`
- `192.png`
- `og.png`

A pure function derives their keys from the stored one. That keeps the database honest (it stores
one real object key) without adding five columns that can only ever change together.

Each upload uses a fresh `uuid`, so keys are immutable and no CDN purge is ever needed. This is
the opposite of the fixed-key case in `feedback_cloudflare_edge_cache`.

### 2. Upload (staff, `/staff/storefront`)

A new "Square mark" uploader sits next to the existing logo uploader. In the browser, the admin's
image (PNG, JPEG or WebP; anything `createImageBitmap` can decode) is drawn into five canvases:

| File | Size | Background | Use |
|---|---|---|---|
| `32.png` | 32×32 | transparent | favicon |
| `180.png` | 180×180 | the vendor's `brandCream` | apple-touch-icon (iOS paints transparency black) |
| `192.png` | 192×192 | transparent | manifest icon; header mark |
| `512.png` | 512×512 | transparent | manifest icon; the stored key |
| `og.png` | 1200×630 | the vendor's `brandCream` | Open Graph image; the mark is drawn 480×480, centred |

A non-square source is **contained** inside the square with transparent padding. It is never
cropped or stretched. A source whose longer edge is under 512 px is refused before upload with a
plain message: it would blur on a home-screen icon.

The flow mirrors the logo uploader:

1. A server action `requestMarkUpload` returns five presigned `image/png` PUT URLs under one fresh
   folder.
2. The browser PUTs all five.
3. `attachVendorMark` receives the `512.png` key. It checks that the key belongs to the caller's
   vendor and has the exact shape. It `headObject`s all five files: each must exist, be
   `image/png` and be no larger than `MAX_IMAGE_BYTES`. Only then does it write the column.

If any check fails, it deletes whichever of the five files exist and writes nothing, so a half
set is never attached. Error reporting follows #749: the HTTP status is shown, and a network throw
is caught.

The OG background is the cream **at upload time**. Changing colours later does not regenerate it.
Re-uploading the mark does. That is recorded in the admin guide rather than solved: regenerating
on the Worker is image work at request time for a file that changes rarely, and it was rejected at
Discover.

### 3. Head metadata, manifest, `/favicon.ico`

These behave differently when the resolved vendor has a mark and `CDN_BASE_URL` is set, and when
it does not.

| Surface | With a mark | Without a mark (or with no `CDN_BASE_URL`) |
|---|---|---|
| `generateMetadata()` in `app/layout.tsx` | `icons.icon` → `32.png` and `192.png` (`type: image/png` and `sizes`); `icons.apple` → `180.png`; `openGraph` → `siteName` = vendor name, `type: website`, `images` → `og.png` with width 1200, height 630 and `alt` = vendor name | Exactly as today: no `icons`, no `openGraph` |
| `app/manifest.ts` | `icons` lists `192.png` and `512.png` with `purpose: "any"` | Exactly as today: `icons: []` |
| New `app/favicon.ico/route.ts` | `302` to the vendor's `32.png`, with `Cache-Control: public, max-age=300` | `404` |

The builders are pure functions in one new module, which the layout, the manifest and the route
call. The URLs are absolute CDN URLs composed the way `Header.tsx` already does it
(`composePublicUrl(CDN_BASE_URL, key)`). CSP `img-src` already allows `https://*.nocaped.com`.

**Why `/favicon.ico` redirects:** browsers and some crawlers request it regardless of `<link>`
tags. A real multi-resolution `.ico` would need ICO encoding, and nothing in the stack does that.
The 32 px PNG behind a redirect is what every current browser accepts.

### 4. Header

The brand area of `components/layout/Header.tsx` is extracted into a presentational
`HeaderBrand` component. It is pure props (`name`, `localityName`, `logoUrl`, `markUrl`), so it can
be rendered in a unit test. `Header` passes the `192.png` URL as `markUrl`.

| Vendor has | Below 768px (`md`) | From 768px |
|---|---|---|
| logo **and** mark | the mark, in a reserved **40×40** box | the logo, in today's reserved **72×40** box |
| logo only | today's behaviour: logo in the 72×40 box | same |
| mark only | the wordmark, with the mark image replacing the initial tile (40×40) | same |
| neither | today's wordmark | same |

Each box keeps its size before the image decodes, so there is no layout shift (#329). Each image
renders through `ImageWithFallback`; the fallback is the existing `missingLogo` / initial-tile markup
at the same footprint (#655). The `alt` text stays `${name} — Your Local Store` for both images.

Only one of the two header images is visible at a time. The hidden one must not compete for
bandwidth: below `md` the logo image is not requested, and from `md` the mark image is not
requested. A `<picture>` with a `media` source, or equivalent, achieves this, and the build picks
the mechanism. The requirement is the measured outcome.

This applies to the staff portal header too, because it is the same component.

`scripts/verify-mobile-layout.ts` gains a `brand` measurement:

- the rendered width and height of the visible brand image;
- which file it shows (`192.png` or the logo key);
- whether a second brand image was fetched.

The thresholds stay in `requirements.md` (the script measures and does not judge).

### 5. Docs

- **`specs/design-system.md`:** a "Brand assets: lockup and mark" section. It covers the two
  slots, the header rule, the five generated files, guidance to upload the lockup at about 9:5 so
  it fills the 72×40 box, and the cream-at-upload caveat.
- **`docs/store-admin-guide/admin-tabs-guide.md`:** the `/staff/storefront` section gains the mark
  upload. Every sentence must trace to a real control (CLAUDE.md staff-panel rule).

## Deliberately excluded

- **SVG uploads.** An SVG can carry script and needs a sanitiser. Uploads are rasterised in the
  browser, as the logo already is.
- **A footer logo, and a light-on-dark variant.** The footer paints the dark primary, and neither
  the reference blue nor the lime survives on it (discovery log). It is a separate decision.
- **A wider desktop logo box.** The 72×40 box stays. Changing it reopens #655's 360 px and 1024 px
  measurements. The guide tells vendors to supply a lockup at about 9:5 instead.
- **Removing a mark.** There is no remove control for the logo either; a vendor replaces it. A
  remove action is a small follow-up if asked for.
- **Deleting superseded mark folders.** Old uploads stay in storage, as old logos do today.
- **Per-product Open Graph images and a `twitter:` card.** Product pages inherit the layout's
  `openGraph`, so a shared product link previews with the vendor mark. Showing the product photo
  instead is a separate SEO slice, alongside the seventh pass's crawler finding.
- **Maskable icons, a dark-mode favicon, a true multi-resolution `.ico`.**
- **Applying the new Aheed palette, and any SriMart change.** The palette is data (a `Theme` or
  the colour form on `/staff/storefront`). The owner ruled to leave SriMart as it is.
- **The artwork itself.** It comes from the owner's designer (#1069 Gate 1 ruling).

## Open items carried forward

- **Real Aheed artwork:** an owner action. Upload it on `/staff/storefront` once the designer
  delivers.
- **Production:** the migration is additive. With no mark uploaded, production renders exactly as
  today, which is the production verification for this slice.
