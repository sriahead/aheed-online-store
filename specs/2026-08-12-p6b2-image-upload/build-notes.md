# P6b2 — Product image upload via presigned PUT (build notes)

Written at the end of Build, before the Clear. The validating context has only `plan.md`,
`requirements.md`, `validation.md`, the artifact and this file.

**Read `validation.md`'s "Before starting" block first** — three prerequisites gate the live rows,
and one of them (the `localhost` `VendorDomain` fixture) is not obvious from the code.

## What changed and why

**`lib/product-image.ts` (new).** Every rule about what a key means and what an image may be, with
no imports at all. It is imported by *both* the server actions and the browser uploader, which is
the second reason it holds no imports: `lib/storage.ts` carries the aws4fetch signer, so a client
component reaching for these constants must not drag the signer into the bundle. `fitWithinEdge`
lives here rather than in the component so the 1200px rule is unit-testable without a canvas — the
browser has the only `<canvas>`, but it should not also hold the only copy of the arithmetic.

**`lib/storage.ts` — two methods.** `presignPut` (SigV4 query signing) and `headObject`. Both are
plain S3; nothing R2-specific entered the port. There is **deliberately no delete method**, and the
file says so and points at #174 — that comment is load-bearing, see "Known-shaky areas".

**`features/admin/product-image.ts` (new, `"use server"`) — exactly two exports, both async.** The
file's header comment explains why at length, because P6b1 (#159) shipped the opposite to its own
validation stage and no build-time check caught it. Module-level constants here are *not* exported,
which is the distinction that matters: Next validates the export set, not the module's contents.

**`lib/repositories/products.ts` — `setPrimaryProductImage`.** Repoints the primary row inside a
transaction, creating it when absent. Vendor-scoped by looking the product up with `vendorId` in the
`where`, exactly as `updateProductForVendor` does, so another vendor's product is indistinguishable
from one that never existed. Non-primary rows are left alone rather than cleared — none exist today,
but #173 will create them and this must not destroy their data when it lands.

**`components/staff/ProductImageUploader.tsx` (new).** Converts on a canvas, PUTs, then attaches.

**`ProductForm.tsx` — the images section moved *outside* the `<form>`.** Uploading is its own
immediate write with its own button; it does not wait for "Save changes" and must not be submitted
by it. Nesting would also have put a file input inside the product form. The visible consequence is
that Images now renders *below* the save row, which actually communicates the independence better
than its old position did.

**Four docs corrected, not three.** `CLAUDE.md`, `specs/architecture.md` §3.3, `tech-stack.md` and
ADR-003 all gave the example key as `products/{sku}/main.webp`. `Product` has no `sku` field and
never has; the seed writes `products/{slug}/main.svg`. R30 named only three of the four — see
"Deviations".

## Decisions taken during the build

**`allHeaders: true` when signing.** aws4fetch lists `content-type` in `UNSIGNABLE_HEADERS`, so the
default drops it from the signature and the resulting URL would accept a body of **any** type.
Passing `allHeaders: true` pins the upload to `image/webp` — the browser must send exactly that
value or the signature fails. This was not in the spec because the spec did not know it; it was
found by reading `node_modules/aws4fetch/dist/aws4fetch.esm.mjs` rather than assuming. It is not the
only guard (`headObject` re-checks what landed), but it is the cheapest one and it fails closed.

**Size is enforced twice, differently.** `requestImageUpload` rejects a *declared* byte length over
the cap before presigning; `attachProductImage` rejects an *actual* `contentLength` over the cap
before writing. The first saves a pointless signature, the second is the one that is actually true.
Rejected: signing `content-length` to make the PUT itself refuse an oversized body — it would work,
but it makes the signature depend on a number the client chooses, and a mismatch surfaces as an
opaque 403 rather than a message.

**A five-minute presign TTL.** Long enough for a slow phone upload of a ~250 KB WebP, short enough
that a URL sitting in browser history is useless by the time anyone finds it.

**The uploader is driven by `useTransition` and plain handlers, not `useActionState`.** The flow is
three sequential awaits with a non-action `fetch` in the middle, which `useActionState` does not
model. `type="button"` on the submit control is deliberate and commented.

**Alt text falls back to the product name in the repository**, where `product.name` is already
selected, rather than in the action or the component. `ProductImage.alt` is non-null and an empty
alt on a storefront image is an accessibility defect, so the fallback belongs at the last point
before the write.

**Refusals are returned as data, never thrown**, matching `lib/auth-rbac.ts` and P6b1's actions —
so a refusal renders as a message rather than a 500.

## Deviations from the spec

**R30 named three docs; four carried the stale `{sku}` example.** `tech-stack.md` was also wrong
and was corrected. Fixing three of four would have left a stale doc that the next reader could
reasonably trust — the exact failure mode `/orient` exists to catch. R30 as written is still
satisfied; this is additive.

**`plan.md`'s CORS JSON was the wrong shape and has been corrected on this branch.** It gave the
S3-style `AllowedOrigins`/`AllowedMethods` form; `wrangler r2 bucket cors set` requires the R2 API
shape (a `rules` array with a nested `allowed` object) and rejects the other outright. Found by
running it, not by reading it. The corrected JSON and the failure message are both in `plan.md`.

**Staging bucket CORS was applied during Spec, not left as an owner action.** #167 called it a hard
stop requiring the owner; `wrangler` turned out to be authenticated here, so it was applied and
verified. **Production CORS is deliberately NOT applied** — it is a live-site change with nothing to
serve until this slice promotes, so it belongs to the promotion. `plan.md` carries the production
rule verbatim.

**R25 was verified at Spec, before any code existed.** Allowed origins return `204` with the echoed
header; `https://example.invalid` returns `403` with none. Re-run it at Validate rather than
trusting that sentence — it is recorded because it de-risked the design, not to substitute for the
check.

## Known-shaky areas

**Nothing in this slice has touched a real database or a real browser.** Every DB and upload row is
unproven. In particular:

1. **The whole browser leg is unexercised.** `createImageBitmap(..., { imageOrientation: "from-image" })`,
   `canvas.toBlob(blob, "image/webp", 0.82)` and the cross-origin PUT have never run. Chrome
   supports all three, but EXIF orientation especially is the kind of thing that is either perfect
   or silently ignored. R22 and R26 are where this is decided.
2. **`allHeaders: true` is the single riskiest line in the slice.** If the browser's `fetch`
   normalises `content-type` differently from what was signed, every upload fails with an opaque
   `403` from storage and the UI will say "rejected by storage (403)". If R26 fails that way, this
   is the first place to look — try signing without `allHeaders` to confirm the diagnosis before
   changing anything else.
3. **`headObject` has never seen a real response.** It maps 404 → `null` and throws on other
   non-OK statuses; R2's actual 404 shape for a HEAD on a missing key is assumed, not observed.
   R3 covers it directly and is worth running early, since R15 depends on it behaving.
4. **`revalidatePath` on four paths is unverified.** R24 asserts the new image appears without a
   manual refresh; `revalidatePath("/categories", "layout")` copies P6b1's pattern but nothing has
   confirmed the storefront product page actually busts.
5. **The `localhost` `VendorDomain` fixture is a guess about `lib/tenant.ts`'s behaviour** — that
   the port is stripped (`tenant.ts:15`) and that the two-active-vendor fallback therefore does not
   fire. Read from the code, never run with a browser. If `/staff/products/{id}` 500s or redirects
   to `/coming-soon` under `npm run preview`, this is why, and the fixture is the fix.
6. **R20 must not be checked by grepping for `delete`.** `lib/storage.ts` and ADR-003 both *name*
   the deletion this slice deliberately omits, so a source grep passes only if that explanation is
   removed. `validation.md`'s row is behavioural for exactly this reason. Same trap P4a hit twice.
7. **`format:check` fails locally on 52 files and this is not real.** Proven, not assumed: files
   this branch never touched (`prisma/seed.ts`, `tests/order-totals.test.ts`) fail locally and pass
   when their committed blob is checked with LF endings under `.prettierrc.json`; all seven files
   this slice touches pass the same way. CI on Linux is the authority.

**Local gate at the end of Build:** `typecheck` clean, `npm test` 329 passing across 30 files
(19 new), `lint` 0 errors (4 pre-existing `<img>` warnings, the repo-wide convention), `next build`
succeeds with every `/staff/*` route still dynamic.
