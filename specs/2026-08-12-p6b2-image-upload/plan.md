---
id: p6b2-image-upload
title: "P6b2 — Product image upload via presigned PUT (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-12
visibility: internal
summary: The catalogue's image write path — an admin uploads a product photo from the browser straight to object storage through a Worker-signed PUT, and the ProductImage row repoints to an immutable key. P6's last slice.
tags: [p6, admin, catalogue, storage, upload, r2, s3]
related: [adr-003-storage-abstraction, p6b1-catalogue-writes, architecture]
---

# P6b2 — Product image upload via presigned PUT (plan)

**Goal:** give an admin a way to put a real photograph on a product. P6b1 (#159) made every
*field* of a product editable from `/staff/products/{id}`; the image stayed read-only, and the only
way to change one has always been a developer re-running `prisma/seed.ts`. This slice closes that,
and in doing so exercises three capabilities the project has never had: the **first write through
`lib/storage`** at runtime, the **first request the Worker has ever signed**, and the **first
browser-direct upload**. Shipping it closes P6.

## Why the shape is what it is

**Presigned PUT, not a proxy upload.** The Worker signs a short-lived `PUT` and the browser sends
the bytes straight to object storage. No image ever transits the Worker, so Workers' request-size
and CPU limits are not in the upload path. *Rejected:* proxying through a route handler — a simpler
client, but every image would fight those limits and a 5 MB photo on a phone connection would hold
a Worker invocation open for the duration.

**The port gains two S3-generic methods, not an R2 feature.** `presignPut` (via `aws4fetch`'s
`signQuery`) and `headObject`. ADR-003 already anticipated both — §3.3 of `specs/architecture.md`
lists "presigned URLs" among the standard operations the port may use. Nothing R2-specific enters
`lib/storage.ts`.

**Immutable keys: `products/{productId}/{uuid}.webp`.** A new upload writes a **new** object and
the `ProductImage` row repoints; nothing is ever overwritten. *Rejected:* the fixed
`products/{slug}/main.*` shape the seed uses — overwriting at a fixed key needs an explicit
Cloudflare cache purge to become visible (a trap this project has already hit and recorded in
`CLAUDE.md`), which would mean a purge-scoped API token as a new Worker secret and a
Cloudflare-specific call inside a deliberately vendor-agnostic port. Keying on `productId` rather
than `slug` also survives a slug edit, which P6b1 made possible for the first time.

> **Correction this slice carries.** `CLAUDE.md` and `specs/architecture.md` both give the example
> key as `products/{sku}/main.webp`. **`Product` has no `sku` field** and never has; the seed
> actually writes `products/{slug}/main.svg` — SVG, not WebP, and slug-keyed. Both docs are
> corrected on this branch rather than left to mislead the next reader. The two key shapes coexist
> with no migration: a product that has never been uploaded to keeps its seeded placeholder key,
> and the DB stores whatever relative key it was given.

**Client-side WebP conversion.** The browser downscales and re-encodes to WebP on a canvas before
uploading, so storage only ever receives sensible files and the `.webp` convention holds literally.
The Worker cannot do this — it never sees the bytes. **1200px longest edge, quality 0.82**, with
EXIF orientation honoured via `createImageBitmap(file, { imageOrientation: "from-image" })` so a
phone photo doesn't land sideways.

**The client is not the only guard — and the server never trusts the key.** Two properties matter
more than they look:

1. **The key is built server-side from the resolved product**, never accepted from the caller.
   `requestImageUpload` takes a `productId` and a byte length; it has no key or filename parameter.
   If the client could name the key, an admin of one vendor could presign a `PUT` over *another*
   vendor's object — the signature would be perfectly valid, because signing proves who is asking,
   not what they should be allowed to ask for.
2. **The row is only written after the object is verified.** `attachProductImage` re-checks the
   role and the product, re-checks the key shape against that product id, and then issues a
   server-side `headObject` — the object must exist, be `image/webp`, and be within the size cap
   before any `ProductImage` row changes. A presigned PUT cannot enforce a body it never sees, so
   the check happens where the truth is.

**Bytes before the row.** Presign → browser PUTs → a second action records the key. The reverse
order risks a `ProductImage` row pointing at an object that was never uploaded, which is a visibly
broken product page; this order risks orphaned bytes, which are invisible and already tracked
(#174).

## Scope (this slice)

- `lib/storage.ts`: `StorageService` gains `presignPut(key, contentType, expiresInSeconds)` and
  `headObject(key)`; both implemented with the existing `aws4fetch` `AwsClient`.
- `lib/product-image.ts` (new, pure, DB-free): `buildProductImageKey`, `isProductImageKey`,
  `MAX_IMAGE_BYTES`, `IMAGE_CONTENT_TYPE`, and the encode constants — the same posture as
  `lib/catalogue-form.ts` (P6b1), `lib/staff-orders-query.ts` (P6a) and `lib/shopping-list.ts`
  (P3d): every rule lives where a test reaches it without a database, a session or a request.
- `features/admin/product-image.ts` (new, `"use server"`): `requestImageUpload` and
  `attachProductImage`. **Exactly two exports, both async functions** — P6b1's trap (#159), now in
  `CLAUDE.md`: a single non-function export in a `"use server"` file 500s *every* action in it, and
  no build-time check catches it.
- `lib/repositories/products.ts`: `setPrimaryProductImage(vendorId, productId, storageKey, alt)`.
- `components/staff/ProductImageUploader.tsx` (new, `"use client"`): file picker, canvas WebP
  conversion, the PUT, then the attach. Rendered by `ProductForm` in the Images section that
  `ProductForm.tsx:254-280` already reserves with the placeholder copy "Uploading and replacing
  images is coming next."
- Doc corrections on the same branch: `specs/architecture.md` §3.3 (the key convention, the real
  method names, the immutability rule), ADR-003 (an additive implementation note, no decision
  reopened), and `CLAUDE.md`'s storage line (the `{sku}` example).

**No schema change, no migration.** `ProductImage` has carried `storageKey`, `alt`, `sortOrder` and
`isPrimary` since P2.

## Deliberately excluded

- **Multi-image management** — add/remove/reorder/set-primary. This slice writes exactly one row:
  the primary image, created if absent and repointed if present. Non-primary rows (none exist
  today) are left untouched rather than clobbered. Deferred to **#173**.
- **Deleting anything.** No storage object and no `ProductImage` row is ever deleted here, so
  superseded objects accumulate. That is the accepted cost of immutable keys, tracked in **#174**
  together with the orphan an abandoned upload leaves between the PUT and the attach.
- **Image variants / responsive sizes.** One image, one size. `next/image` adoption is #46 and is a
  storefront-wide decision.
- **Category images.** `Category` has no image relation; adding one is a schema change and belongs
  to its own slice.
- **A STAFF-visible version.** This surface stays ADMIN-only, matching P6b1 and #168.
- **Applying the bucket CORS policy from code.** The policy is applied once per bucket with
  `wrangler r2 bucket cors set`; making it a repo-managed artifact was considered and left out —
  it is a one-time, two-command owner action, and putting it in the build would mean the deploy
  pipeline holds bucket-admin rights it otherwise doesn't need.

## Prerequisites

**Bucket CORS — required before any browser upload can work, in any environment.** Confirmed absent
at Orient: `wrangler r2 bucket cors list` returns `The CORS configuration does not exist
[code: 10059]` for both `aheed-images-staging` and `aheed-images-production`. Apply with
`wrangler r2 bucket cors set <bucket> --file <file>`:

```json
[
  {
    "AllowedOrigins": [
      "https://staging.aheedfoodcentre.nocaped.com",
      "https://srimart-staging.nocaped.com",
      "http://localhost:8787"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

`aheed-images-production` takes the same rule with origins `https://aheedfoodcentre.nocaped.com`
and `https://srimart.nocaped.com`, and **no localhost entry**. The `http://localhost:8787` entry on
staging exists so R24 can be validated against `npm run preview` with a real browser.

The Worker runtime secrets this needs — `S3_ACCESS_KEY` and `S3_SECRET_KEY` — were **verified
present on both `aheed-store-staging` and `aheed-store-production`** at Orient, so #167's second
"hard stop" is already met and is not a prerequisite.

## A trap this slice's validation has to design around

Every prior slice drove server actions headlessly with `node:http`. **That technique cannot prove
CORS.** A `node` request sends no `Origin` header and is not subject to the same-origin policy at
all, so a headless upload succeeds whether or not the bucket policy exists. R23 therefore tests the
bucket directly with an explicit `OPTIONS` preflight, and R24 uses a **real browser** against
`npm run preview`.

The browser leg needs one more thing: `lib/tenant.ts:15` strips the port before matching, so a
browser at `http://localhost:8787` resolves host `localhost`, which has no `VendorDomain` row — and
the single-active-vendor fallback does not fire because staging has two (Aheed and SriMart). A
documented, reversible `VendorDomain(host: "localhost")` fixture row is therefore part of R24's
setup, spelled out in `validation.md`. It is safe: the staging Worker is reachable only through its
custom domains, so no external request can ever arrive with `Host: localhost`.

## Open items carried forward

- **#174** — superseded and orphaned objects are never deleted. Filed at Propose; needs its own
  Propose to choose between an inline delete and a scheduled sweep (the latter would be the first
  cron trigger in `wrangler.toml`).
- **#173** — multi-image management.
- **#168 / #169** — STAFF stock-only editing, and admin product search. Unchanged by this slice.
- **#175 — staging Neon password exposure.** During this slice's Spec stage a shell command
  matching `BASE_URL` also matched `DATABASE_URL` and printed staging's connection string,
  password included, into an assistant transcript. Same class as #156. Rotating it needs
  `secrets/staging.vars`, `.env`/`.dev.vars`, the GitHub `DIRECT_URL` environment secret and the
  Worker's `DATABASE_URL` runtime secret all updated plus a redeploy — the full checklist is on
  the issue. Not blocking this slice; no code depends on it.
