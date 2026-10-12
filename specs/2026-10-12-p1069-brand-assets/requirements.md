# Per-vendor brand assets (requirements / acceptance criteria)

This closes #1069. A vendor uploads one square **mark** on `/staff/storefront`. The browser turns it
into five PNGs, stored under one folder. The platform then emits a favicon, an apple-touch icon,
manifest icons and an Open Graph image, and the header shows the mark below 768px. A vendor with no
mark renders exactly as before this slice. Reasoning is in `plan.md`; the measured gap is in
`docs/research/discovery-log.md` (2026-10-12).

**Terms used below.**

- **The mark folder** is `vendors/{vendorId}/mark-{uuid}/`, where `{uuid}` is a lowercase RFC 4122
  UUID.
- **The five files** are `32.png`, `180.png`, `192.png`, `512.png` and `og.png` in that folder.
- **"Has a mark"** means `VendorBranding.markStorageKey` is non-null **and** `CDN_BASE_URL` is set.
- **`{cdn}`** is `CDN_BASE_URL`, composed with a key by `composePublicUrl`.

## Schema

R1. `prisma/schema.prisma` declares `markStorageKey String?` on `VendorBranding`. One new migration
    under `prisma/migrations/` adds that column as nullable `TEXT`. The migration's SQL contains no
    `DROP` statement, and touches no table other than `VendorBranding`. In particular it does not
    drop any `pg_trgm` index.

## Keys (pure module)

R2. A new module `lib/vendor-mark.ts` exports the following, and none of them reads request context
    or the database:
    - `buildVendorMarkFolder(vendorId)` returns `vendors/{vendorId}/mark-{uuid}` with a fresh UUID.
    - `markFileKeys(markStorageKey)` returns the five keys `{ icon32, apple180, icon192, icon512, og }`
      for a valid stored key. It returns `null` for a key that is not exactly
      `vendors/{id}/mark-{uuid}/512.png`.
    - `isVendorMarkKey(key, vendorId)` is `true` only when `key` matches
      `vendors/{vendorId}/mark-{uuid}/512.png` for **that** `vendorId`.
    - A `MARK_FILES` constant lists each file's name, width, height and whether it has a cream
      background (`180.png` and `og.png` do; the other three are transparent).

## Server actions (`features/admin/storefront.ts`)

R3. `requestMarkUpload(byteLengths)` requires the `ADMIN` vendor role and returns the
    `refusal(...)` message otherwise. It takes the five byte lengths, keyed by file. It refuses if
    any length is not an integer, is 0 or less, or is greater than `MAX_IMAGE_BYTES`. On success it
    returns `{ markStorageKey, uploads }`:
    - `markStorageKey` is the `512.png` key in one fresh mark folder for the caller's vendor;
    - `uploads` holds one presigned `PUT` URL per file, each for content type `image/png`, with the
      same TTL as `requestLogoUpload`.

R4. `attachVendorMark(markStorageKey)` requires `ADMIN` and does the following:
    - It returns `"Invalid upload key."` and calls no storage method when
      `isVendorMarkKey(markStorageKey, auth.vendorId)` is false. A key for another vendor's ID is
      one of these cases.
    - It calls `headObject` for all five files.
    - If any file is missing, has a content type other than `image/png`, or is larger than
      `MAX_IMAGE_BYTES`, it calls `deleteObject` for **each of the five files that exists**,
      returns an error, and does **not** write `markStorageKey`.
    - Otherwise it writes `markStorageKey` for the caller's vendor through a repository function
      that takes the client and `vendorId` explicitly. It then calls `revalidatePath` for
      `/staff/storefront` and for `"/", "layout"`.

R5. `features/admin/storefront.ts` still exports only async functions. `MARK_FILES` and the key
    helpers live in `lib/vendor-mark.ts`, not in the `"use server"` file.

R6. The write in R4 is a singular `update` (or `upsert`) with no nested writes. It goes through
    `getPrisma()`; no `updateMany`/`createMany` and no websocket client are added.

## Uploader (`/staff/storefront`)

R7. `/staff/storefront` renders a "Square mark" uploader in the same area as the existing logo
    uploader:
    - It has a file input that accepts images, and an Upload button.
    - When a mark exists, it shows a preview of the current `192.png`.
    - It has one line of help text saying the mark is used for the browser tab icon, the phone
      home-screen icon, link previews and the header on phones.

R8. The uploader produces all five files client-side, at the dimensions in `MARK_FILES`. All five
    are `image/png`.
    - A non-square source is centred and scaled to fit inside the square without cropping or
      distortion. The padding in `32/192/512.png` is transparent.
    - `180.png` and the whole of `og.png` are filled with the vendor's current `brandCream` before
      the mark is drawn.
    - In `og.png` the mark is drawn in a 480×480 square centred on the 1200×630 canvas.

R9. The uploader refuses a source whose longer edge is under 512px. It makes no network request and
    shows: `This image is too small — use one at least 512 pixels wide or tall.`

R10. The uploader reports a failed `PUT` with its HTTP status, and a thrown network error with its
     message, in the same wording pattern as `VendorLogoUploader` (#749). After an upload error it
     does not call `attachVendorMark`.

## Head metadata, manifest, favicon

R11. A new pure module (for example `lib/vendor-icons.ts`) builds the icon and Open Graph metadata
     from `(vendorName, markStorageKey, cdnBaseUrl)`, and the manifest icon list from
     `(markStorageKey, cdnBaseUrl)`. When the key is null, the CDN base is unset, or `markFileKeys`
     returns null, it returns **no** `icons`, **no** `openGraph` and an **empty** manifest icon
     list.

R12. For a vendor that has a mark, the storefront home page's `<head>` contains:
     - `<link rel="icon">` to `{cdn}/…/32.png` with `sizes="32x32"` and `type="image/png"`;
     - `<link rel="icon">` to `{cdn}/…/192.png` with `sizes="192x192"`;
     - `<link rel="apple-touch-icon">` to `{cdn}/…/180.png`;
     - `og:image` to `{cdn}/…/og.png`, with `og:image:width` `1200` and `og:image:height` `630`;
     - `og:site_name` equal to the vendor name, and `og:type` `website`.

R13. For a vendor with no mark, the home page's `<head>` contains no `rel="icon"`, no
     `rel="apple-touch-icon"` and no `og:image`. Its title and description are unchanged from
     before this slice.

R14. `/manifest.webmanifest` for a vendor that has a mark lists exactly two icons: `192.png`
     (`"sizes": "192x192"`) and `512.png` (`"sizes": "512x512"`). Both have `"type": "image/png"`
     and `"purpose": "any"`. For a vendor with no mark, `icons` is `[]`. `name`, `short_name`,
     `theme_color` and `background_color` are unchanged.

R15. `GET /favicon.ico` behaves as follows:
     - For a vendor that has a mark, it responds `302` with `Location` equal to that vendor's
       `{cdn}/…/32.png` and `Cache-Control: public, max-age=300`.
     - For a vendor with no mark, or a host where no vendor resolves, it responds `404`.
     - It is implemented as `app/favicon.ico/route.ts`, and there is no `app/favicon.ico` file and
       no `public/favicon.ico`.

R16. Two vendors with different marks get different icon, manifest and `/favicon.ico` URLs. Each
     URL contains only that vendor's own `vendors/{vendorId}/` prefix.

## Header

R17. The brand area of `components/layout/Header.tsx` is a separate component, `HeaderBrand`, that
     takes `name`, `localityName`, `logoUrl` and `markUrl` as props and reads no request context.
     `Header` passes the `192.png` URL as `markUrl` (or `null`).

R18. Rendered by `HeaderBrand`, per case (the "today" markup is the markup on `staging` before this
     slice):
     - **Logo and mark:** the mark image is in a box of exactly 40×40 CSS px below 768px and is not
       displayed from 768px. The logo image keeps today's `h-10 aspect-9/5` box (72×40) from 768px
       and is not displayed below 768px.
     - **Logo only:** the same element, classes (`h-10 w-auto shrink-0 aspect-9/5 object-contain …`)
      and `alt` as today, at every width, with no mark element.
     - **Mark only:** the wordmark (name and locality) renders at every width, and the mark image
       replaces the initial-letter tile in its 40×40 box.
     - **Neither:** today's wordmark (initial-letter tile, name, locality), with no image element.

R19. Every brand image renders through `ImageWithFallback` with `alt` `${name} — Your Local Store`.
     Its fallback has the same box size as the image it replaces. Both brand image boxes have their
     size reserved in CSS before the image loads.

R20. With logo and mark both set, a 360px-wide page load makes an image-element request
     (`initiatorType` `img`) for `192.png` and none for the logo object. A 1024px-wide load makes
     one for the logo object and none for `192.png`. Favicon and manifest fetches are not counted.

R21. `scripts/verify-mobile-layout.ts` prints, in each width's JSON object, a `brand` field with:
     - the visible brand image's file (the URL's final path segment);
     - its rendered `width` and `height`;
     - the list of brand-image URLs the page requested, taken from
       `performance.getEntriesByType("resource")` entries with `initiatorType === "img"`.

     The script still exits 0 with no thresholds, and its existing output fields are unchanged.

R22. On a vendor with logo and mark, at widths 360, 390, 768 and 1024, `documentScrollWidth` equals
     the viewport width.

## Docs

R23. `specs/design-system.md` has a section titled `Brand assets: lockup and mark (#1069)`. It
     states:
     - the two slots;
     - the R18 header table;
     - the five generated files and their uses;
     - that a lockup is best supplied at about 9:5;
     - that `og.png`'s background is the cream at upload time.

     Its front-matter `version` is bumped and `updated` is the build date.

R24. The `/staff/storefront` section of `docs/store-admin-guide/admin-tabs-guide.md` names the
     Square mark upload, what it is used for, and the 512px minimum. It also says that re-uploading
     is how a colour change reaches the link-preview image. Every capability it states exists as a
     control on `/staff/storefront`.

## Tests

R25. Unit tests cover:
     - `lib/vendor-mark.ts`: key shape, derivation, and cross-vendor rejection;
     - the R11 builders: with a mark, without one, with no CDN base, and with a malformed key;
     - the `/favicon.ico` handler: 302 with a mark, 404 without, 404 with no vendor;
     - `attachVendorMark`: wrong-vendor key, one missing file, one wrong content type, and success;
     - `HeaderBrand`'s four cases, rendered to static markup.

## Gates

R26. `CHANGELOG.md` has an entry for #1069 under `[Unreleased]` (Gate 4).

R27. `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check`,
     `npm run kms:validate` and `npm run kms:check-generated` all exit 0 after this slice. The
     tests also include the existing repository-purity, client-injection and `use server` guards.
