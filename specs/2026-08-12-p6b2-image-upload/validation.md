# P6b2 — Product image upload via presigned PUT (validation)

## Before starting — three checks, in this order

1. **Which database is live.** Diff `.env`, `.dev.vars`, `secrets/staging.vars` **and**
   `secrets/production.vars`. All of the first three must name the **staging** Neon project
   (`ep-empty-scene-…`); production is `ep-young-glitter-…`. Two files agreeing with each other
   proves nothing (see the P5a incident in `specs/roadmap.md`). `S3_BUCKET` must read
   `aheed-images-staging` and `CDN_BASE_URL` `https://images.staging.aheedfoodcentre.nocaped.com`
   — every live row below writes to that bucket.
2. **Bucket CORS is applied.** `npx wrangler r2 bucket cors list aheed-images-staging` must print a
   rule, not `The CORS configuration does not exist [code: 10059]`. If it errors, apply the policy
   from `plan.md` → *Prerequisites* first; **R25 and R26 cannot pass without it** and must be
   reported unverified rather than skipped.
3. **The localhost tenant fixture (R26 only).** `lib/tenant.ts:15` strips the port, so a browser at
   `http://localhost:8787` resolves host `localhost`, which matches no `VendorDomain`; the
   single-vendor fallback does not fire because staging has two active vendors. Add the row:
   ```
   npx tsx -e "import {PrismaClient} from '@prisma/client'; import 'dotenv/config'; const p=new PrismaClient(); const v=await p.vendor.findFirst({where:{slug:'aheed'},select:{id:true}}); await p.vendorDomain.upsert({where:{host:'localhost'},create:{vendorId:v.id,host:'localhost',isCanonical:false},update:{}}); console.log('localhost ->', v.id); await p.$disconnect();"
   ```
   Safe and reversible: the staging Worker is reachable only through its custom domains, so no
   external request can arrive with `Host: localhost`. Remove it afterwards with
   `p.vendorDomain.delete({where:{host:'localhost'}})` if you prefer a clean fixture.

`npm run preview` (OpenNext + Miniflare), never `npm run dev` — every row below touches Prisma or
the Workers runtime.

| Req | How to verify |
|-----|---------------|
| R1  | `npx tsc --noEmit` exits 0 with the interface in place, and `npx tsx -e "import {getStorage} from './lib/storage'; const s=getStorage(); console.log(typeof s.presignPut, typeof s.headObject)"` prints `function function`. |
| R2  | `npx tsx -e "import {getStorage} from './lib/storage'; import 'dotenv/config'; const u=new URL(await getStorage().presignPut('products/t/x.webp','image/webp',300)); console.log(u.searchParams.get('X-Amz-Expires'), !!u.searchParams.get('X-Amz-Signature'), !!u.searchParams.get('X-Amz-Credential'))"` prints `300 true true`. Signing is local computation — the key `products/t/x.webp` does not exist and the call still succeeds, which is itself the evidence no request was made. |
| R3  | Two calls in one script. `headObject('products/does-not-exist/x.webp')` prints `null`. Then read a real key from the DB first (`(await p.productImage.findFirst({select:{storageKey:true}})).storageKey` — don't hardcode a slug) and `headObject` it: prints a non-null object with a non-empty `contentType` and a positive `contentLength`. |
| R4  | `grep -nE "@/lib/(db\|config\|storage\|auth-rbac)\|next/headers" lib/product-image.ts` returns no match, and `npm test -- product-image` passes with no DB running. |
| R5  | `npx tsx -e "import * as m from './lib/product-image'; console.log(m.IMAGE_CONTENT_TYPE, m.MAX_IMAGE_EDGE_PX, m.IMAGE_QUALITY, typeof m.buildProductImageKey, typeof m.isProductImageKey, m.MAX_IMAGE_BYTES)"` prints `image/webp 1200 0.82 function function <number>`. |
| R6  | Unit test in `tests/product-image.test.ts`: `buildProductImageKey('abc')` matches `/^products\/abc\/[0-9a-f-]{36}\.webp$/`, and two calls are `not.toBe` each other. `npm test` green. |
| R7  | Unit test asserting `true` for a self-built key and `false` for each of the five listed cases (`other-product` id, `products/abc/../evil.webp`, `products/abc/x.png`, `products/abc/nested/x.webp`, `/products/abc/x.webp`). |
| R8  | Unit test: `import * as actions from '@/features/admin/product-image'` then `Object.values(actions).every(v => v.constructor.name === 'AsyncFunction')` is `true` and `Object.keys(actions).length === 2`. |
| R9  | Read `requestImageUpload`'s signature in `features/admin/product-image.ts` — its parameters are the product id and a byte length only. Confirm behaviourally with R26's network log: the browser's call carries no key. |
| R10 | Under `npm run preview`, POST the `requestImageUpload` action id with **no `Cookie` header**, then with a cookie for a signed-in non-admin (a Customer account). Both responses render a refusal string, neither returns a URL. Discover the action id from `.next/server/server-reference-manifest.json` (see `specs/sdd-workflow.md` → Validate). |
| R11 | Signed in as an ADMIN on the Aheed host, call `requestImageUpload` with a **SriMart** product's id; the response is byte-identical to calling it with `'00000000-0000-0000-0000-000000000000'`. |
| R12 | Call `requestImageUpload(<valid aheed product id>, MAX_IMAGE_BYTES + 1)`; response is a refusal and contains no `X-Amz-Signature`. |
| R13 | Call `attachProductImage` directly (no prior `requestImageUpload` in the session) with no `Cookie`: refused. Then with a Customer cookie: refused. Row count unchanged both times. |
| R14 | Call `attachProductImage(<aheed product id>, 'products/<a DIFFERENT product id>/<uuid>.webp', 'x')` as ADMIN → refusal; `select count(*) from "ProductImage" where "productId" = <aheed product id>` unchanged. |
| R15 | Three calls as ADMIN with a correctly-shaped key for the right product: (a) a uuid never uploaded → refusal; (b) after `putObject`-ing a `text/plain` body at that key from a script → refusal; (c) after putting a `image/webp` body larger than `MAX_IMAGE_BYTES` → refusal. `ProductImage` row unchanged after all three. |
| R16 | Pick (or create) a product with zero `ProductImage` rows. Run the full R26 flow on it. Then `p.productImage.findMany({where:{productId}})` returns exactly one row with `isPrimary: true`, `sortOrder: 0` and the new key. |
| R17 | On a seeded product that already has its placeholder row: record `id` and `storageKey` first, run the R26 flow, then re-read — same `id`, same row count, new `storageKey`, new `alt`. |
| R18 | Insert a second row by hand (`isPrimary:false, sortOrder:1`) on the R17 product, record its id/storageKey, run the flow again, re-read: that row is byte-identical and still present. |
| R19 | Run the flow once submitting alt text `Basmati sack` → row's `alt` is `Basmati sack`. Run again submitting an empty alt → row's `alt` equals the product's `name`. |
| R20 | `npx tsx -e "import {getStorage} from './lib/storage'; import 'dotenv/config'; console.log(typeof getStorage().deleteObject)"` prints `undefined`. Then run the R26 flow **twice** on the same product and confirm `p.productImage.count({where:{productId}})` is identical before, between and after. Do **not** grep the source for `delete`: `lib/storage.ts` names the omission and points at #174, so a grep would pass only if that comment were removed. |
| R21 | `head -1 components/staff/ProductImageUploader.tsx` is `"use client";` and `grep -nE "@/lib/(storage\|config)" components/staff/ProductImageUploader.tsx` returns no match. |
| R22 | In the R26 browser run, read the DevTools/network record of the `PUT`: request `content-type` is `image/webp`. Then `headObject` the resulting key and confirm `contentType` is `image/webp`. For the dimension cap, upload a source image wider than 1200px and confirm the stored object decodes to a longest edge of exactly 1200 (`npx tsx -e` with `sharp`, already an approved install script, or read the rendered `naturalWidth` in the browser). For EXIF, upload a photo with `Orientation: 6` and confirm the rendered image is upright. |
| R23 | Load `/staff/products/{id}` as ADMIN — the uploader control is present. Load `/staff/products/new` — `grep` the rendered HTML for the uploader's file input `name`; absent. |
| R24 | Immediately after the R26 upload completes, **without reloading**, the new image is on screen. Then load `/products/{slug}` in the same browser session and confirm the new image renders there too. |
| R25 | `curl -sS -i -X OPTIONS "$S3_ENDPOINT/aheed-images-staging/products/x/y.webp" -H "Origin: https://staging.aheedfoodcentre.nocaped.com" -H "Access-Control-Request-Method: PUT"` returns 2xx including `access-control-allow-origin: https://staging.aheedfoodcentre.nocaped.com`. Repeat with `-H "Origin: https://example.invalid"` — no `access-control-allow-origin` header in the response. **A `node`/`fetch` request is not a valid substitute for either leg: it sends no `Origin` and is not subject to CORS.** |
| R26 | `npm run preview`, then drive a **real browser** (the `mcp__claude-in-chrome__*` tools, or by hand) to `http://localhost:8787/staff/products/{id}`, sign in as the ADMIN demo account, choose a `.jpg` file, submit. Then: (a) `headObject(<key from the row>)` returns `contentType: 'image/webp'`; (b) the `ProductImage` row's `storageKey` matches `^products/{productId}/[0-9a-f-]{36}\.webp$`; (c) the image is visible on the page. Confirm no CORS error appears in the browser console — that is the whole point of this row. |
| R27 | `curl -sSI "https://images.staging.aheedfoodcentre.nocaped.com/<the key from R26>"` returns 200 with `content-type: image/webp`. `git diff --stat origin/staging -- app/\(storefront\) components/product` is empty. |
| R28 | As a platform ADMIN signed in on `srimart-staging.nocaped.com`, call `attachProductImage` with an Aheed product id and a validly-shaped key → refusal. Reverse the hosts and product → refusal. `ProductImage` counts for both products unchanged. (P5a's #141 recorded a cross-vendor case tested in only one direction; both directions here.) |
| R29 | `git diff --stat origin/staging -- prisma/schema.prisma` prints nothing, and `git status --short prisma/migrations/` shows no new directory. |
| R30 | Positive assertions only. `grep -n "presignPut\|headObject" specs/architecture.md` matches inside §3.3, and §3.3 read in full states the immutable-key rule. ADR-003 gained an "Implementation note (2026-08-12)" section and `git diff origin/staging -- specs/decisions/ADR-003-storage-abstraction.md` shows **no deletion** from its Decision or Consequences sections. `CLAUDE.md`'s storage bullet, read directly, gives `products/{productId}/{uuid}.webp` as the example. Both corrected files still contain the string `{sku}` inside the sentence explaining the replacement — that is correct, not a failure. |
| R31 | `git diff origin/staging -- CHANGELOG.md` is non-empty and the new entry sits under `[Unreleased]`. |
| R32 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` all exit 0. On a Windows checkout, treat a `format:check` complaint as suspect until diffed against the committed blob (`git show HEAD:<file>`) — CRLF rewriting has produced false positives here; CI is the authority. |
