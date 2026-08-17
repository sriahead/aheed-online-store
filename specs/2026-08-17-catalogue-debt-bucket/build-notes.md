# Catalogue debt bucket: broken homepage rows, real featured flag, multi-image admin management (build notes)

## What changed and why

**Broken homepage rows (R1, R2, R6).** `lib/repositories/products.ts`'s `ProductRepository` gained
`list()` — a filtered listing with no text-query requirement, reusing the same `findPage()` helper
`listByCategory`/`search` already share. `app/(storefront)/page.tsx` now calls `list()` for both its
rows instead of misusing `search("", {...})`, whose empty-query guard is correct for its real
caller (`/search`) and stays untouched. Live-confirmed against `npm run preview`: the actual
`ProductRow` heading for "New Arrivals" (not the similarly-worded `PromoSlider` banner text) and its
product grid now appear in the rendered HTML, where before this fix neither homepage row rendered
at all.

**Real `isFeatured` flag (R3-R6).** Additive `Product.isFeatured Boolean @default(false)` column
plus a composite index (`vendorId, isActive, isFeatured`, matching the existing
`vendorId, isActive, basePrice` convention), migration
`20260817155623_catalogue_debt_bucket_is_featured`. Wired through `lib/catalogue-form.ts`'s
`ProductFormValues`/`PRODUCT_FIELDS`/`checkbox()` and `lib/repositories/products.ts`'s
`createProductForVendor`/`updateProductForVendor`, mirroring `isHalal`/`isFresh`/`isOrganic`'s
existing shape field-for-field. `ProductForm.tsx` gained an `isFeatured` checkbox. The homepage's
second row is retitled "Featured Products" and filters on `isFeatured: true` via `list()` — no
`isHalal` reference remains in that call.

**Multi-image admin management (R7-R15).** `lib/storage.ts`'s `StorageService` gained
`deleteObject(key)`. `lib/repositories/products.ts` gained four new DB-only functions —
`addProductImage`, `promoteProductImage`, `removeProductImage`, `reorderProductImages` — and
`getProductForAdmin`'s image selection now includes `id`/`sortOrder` (a new
`adminProductImageSelect`, separate from the public `productImageSelect`, since storefront reads
never need a row's id). `features/admin/product-image.ts` gained four matching server actions, each
independently calling `requireVendorRole("ADMIN")`. `attachProductImage` and
`setPrimaryProductImage` are byte-for-byte unchanged — confirmed via `git diff origin/staging`.
`components/staff/ProductImageManager.tsx` is a new client component rendering the gallery
(per-image set-primary/remove/reorder controls) plus an "Add another image" upload distinct from
the existing (also unchanged) `ProductImageUploader`. `ProductForm.tsx` now renders both.

**Standing-decision docs and register (R16-R18).** `specs/architecture.md` §3.3 and
`specs/decisions/ADR-003-storage-abstraction.md` both updated with an additive implementation note
— `deleteObject` is real now, not "deliberately absent" — matching the existing 2026-08-12 note's
style. `docs/gap-register.md`'s GAP-013 and GAP-014 rows/detailed-sections now read `Fixed`; GAP-015
reads `Fixed (partial)` (see Deviations below). `specs/roadmap.md` got a Build-time change-log row.

## Decisions taken during the build

**`removeProductImage`'s storage call moved to the Service layer, not the Repository — a
requirements.md deviation, explained fully under Deviations below**, because
`specs/architecture.md`'s explicit "Presentation → Service → Repository → Prisma; UI/components
never import Prisma or the S3 client" rule (and the existing precedent of `attachProductImage`
calling `headObject` itself rather than teaching `setPrimaryProductImage` about storage) meant the
repository function had to stay DB-only. This wasn't caught during Spec's adversarial pass — worth
remembering to check persistent-doc layering rules against new requirements next time, not just
whether requirements contradict each other.

**Dropped the "Featured Products" row's `viewAllLink`.** The old row linked to
`/search?isHalal=true`; that's meaningless once the row is driven by `isFeatured` instead (not a
`/search` filter, deliberately — see `plan.md`'s excluded section). Neither `requirements.md` nor
`plan.md` specified a replacement, so the link was simply dropped rather than invented. `ProductRow`
already treats `viewAllLink` as optional.

**`ProductImageManager.tsx` duplicates `toWebp()`'s ~20 lines from `ProductImageUploader.tsx`**
rather than extracting a shared helper. R12/R14 required the existing uploader to stay unchanged;
factoring out the shared logic would have meant editing it to import from the new shared location.
Accepted as a small, deliberate maintenance seam — noted under Known-shaky areas.

**Gallery-controls visibility threshold.** Caught a bug in my own first draft: I'd initially only
rendered the per-image gallery (with its remove control) when a product had *more than one* image,
which would make a single-image product's only image un-removable. Fixed to render whenever a
product has *any* images — R14 requires "lists every image the product has," which a single image
still is.

**Icon choices** (`Star`, `Trash2`, `ChevronUp`, `ChevronDown` from `lucide-react`, matching
`ImageUp`'s existing use in `ProductImageUploader.tsx`) — no new dependency, confirmed each export
exists in the installed package version before using it.

## Deviations from the spec

**R10's literal wording has `removeProductImage` "delete the ProductImage row and call
`deleteObject`" as one repository function.** Built instead as: the repository function
(`lib/repositories/products.ts`) is DB-only — deletes the row, reassigns primary if needed, and
returns the removed row's `storageKey` (`RemoveImageResult`) — and the *Service*-layer action
(`features/admin/product-image.ts`) calls `getStorage().deleteObject(storageKey)` after a
successful repository call. This follows `specs/architecture.md`'s documented layering exactly
(Presentation → Service → Repository → Prisma; the repository never imports storage) and matches
how `attachProductImage` already calls `headObject` itself rather than delegating storage
awareness into `setPrimaryProductImage`. The **observable behaviour R10/R15 actually care about —
removing an image deletes both the row and the object — is unchanged**; only which file makes the
`deleteObject` call differs from the spec's literal phrasing.

**R17 said GAP-014 *and* GAP-015 both read `Status: Fixed`. GAP-015 instead reads
`Fixed (partial)`.** GAP-015's own scope (per `plan.md`'s Deliberately Excluded section, written at
Spec time) always excluded abandoned-upload cleanup — that gap remains genuinely unbuilt, not a
documentation lag. Marking it plain `Fixed` would misstate reality in exactly the way this whole
gap-register lineage (P6.5's residual-validation slice, and the slice before that) exists to stop.
R17's wording was imprecise, not the intended scope — caught while actually writing the register
row, not a scope change.

**No new GitHub issue filed for anything newly deferred** — there was nothing new to defer.
`plan.md`'s two carried-forward items (`#174` for abandoned-upload cleanup, GAP-011 on `#163`/`#169`
for the raw-SQL question) were both already-existing issues identified at Propose/Spec time, not
new discoveries during Build.

## Known-shaky areas

**R15's full multi-image live walk was NOT exercised during Build** — only that the "Add another
image" UI renders on a live admin edit page (headless sign-in as `demo-store-admin`, confirmed
`name="isFeatured"` and "Add another image" both present in the rendered HTML). The actual
add → promote → remove → confirm-storage-deletion → reorder cycle through the real UI has never
run. This is the highest-risk untested area: four new DB-touching repository functions with no unit
tests (same posture as `setPrimaryProductImage` before them — DB-touching functions in this file
have never had unit coverage, only live verification), and `deleteObject` has only ever been called
in the (untested) `removeProductImage` path.

**R2's read side is live-confirmed** (a product flagged `isFeatured` via a direct Prisma write
appears in the homepage's "Featured Products" row; both real product-row headings, not just the
`PromoSlider`'s similarly-worded banner text, were distinguished and confirmed present). **The write
side — toggling the checkbox through the real `ProductForm` and confirming `saveProduct` persists
it — was not exercised live**, only confirmed present in rendered HTML. It's a field-for-field mirror
of `isHalal`, which already works, but Validate should still drive it end-to-end rather than trust
the analogy.

**`deleteObject`'s error path is unexercised.** `if (!res.ok && res.status !== 404) throw` has only
ever run against a key that definitely exists (the happy path); no test has forced a real S3/R2
error to confirm the throw actually surfaces as a user-facing refusal rather than an unhandled
500.

**Test residue left on staging.** Product `Apples` (id `22c16525-3eb0-4c31-a132-ddb32a587462`) was
flagged `isFeatured: true` via a scratch script during Build's smoke test, to prove the homepage
read path without waiting on a full UI round-trip. Real data, not a fixture — harmless (demo vendor,
and Validate's R2 row picks a *different*, unflagged product regardless of this), but worth knowing
before someone reads it as seed state.

**Migration applied to staging only.** `20260817155623_catalogue_debt_bucket_is_featured` ran
against the staging Neon project (`.env`/`.dev.vars`/`secrets/staging.vars` confirmed to agree on
`ep-empty-scene-zafjzeye` first). Production still needs the normal CI `npm run db:migrate`
(`DIRECT_URL`) path on promotion — not run here.

**`ProductImageManager.tsx` duplicates `ProductImageUploader.tsx`'s WebP-conversion logic** (see
Decisions above) — a maintenance seam: a future change to resize/quality/orientation handling needs
updating in two places.
