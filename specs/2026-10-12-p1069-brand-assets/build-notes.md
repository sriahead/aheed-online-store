# Per-vendor brand assets (build notes)

Written at the end of Build (2026-10-13), before the Clear. Branch `feature/p1069-brand-assets`
(from `staging` at `9bb609d`). Commits: spec `30831e3`, implementation `61022ce`, then these notes.

## What changed and why

- **Schema and migration.** `VendorBranding.markStorageKey String?` and
  `prisma/migrations/20261012210000_p1069_vendor_mark/migration.sql`, which is one
  `ALTER TABLE … ADD COLUMN "markStorageKey" TEXT`. **The migration is NOT yet applied to dev.**
  Validation Setup step 2 asks the user to run `! npx prisma migrate deploy`.
- **`lib/vendor-mark.ts`** defines the key shape once. It holds `MARK_FILES`, the folder builder,
  `markFileKeys`, `isVendorMarkKey`, and the pure drawing geometry (`containInSquare`,
  `markEdgeFor`) the uploader uses, so R8's "contained, not cropped" rule is unit-tested without a
  canvas.
- **`lib/vendor-icons.ts`** holds the R11 builders: `markUrls`, `buildVendorIconMetadata`,
  `buildManifestIcons` and `faviconRedirectUrl`. `app/layout.tsx`, `app/manifest.ts`,
  `app/favicon.ico/route.ts` and `Header.tsx` all go through `markUrls`, so they cannot disagree.
  Without a mark, `buildVendorIconMetadata` returns `{}`. The layout spreads it, so a markless
  vendor's metadata object has exactly the keys it had before (`title`, `description`).
- **Server actions** (`features/admin/storefront.ts`) are `requestMarkUpload(byteLengths)` and
  `attachVendorMark(markStorageKey)`. The ownership check runs before any storage call. If any
  file is bad, every file that exists is deleted. The write goes through the new repository
  function `updateVendorMarkKey(prisma, vendorId, key)`, a singular `update` over `getPrisma()`,
  via the `lib/vendor-service.ts` facade.
- **The uploader** is `components/staff/VendorMarkUploader.tsx`, rendered after
  `VendorLogoUploader` in `StorefrontConfigForm`. The staff page passes it the `192.png` preview
  URL and the **saved** `brandCream`.
- **Header.** The brand block moved out of `Header.tsx` into `components/layout/HeaderBrand.tsx`,
  which takes props only. The logo-only and neither branches are moved verbatim; the comments
  moved with them. `Header.tsx` computes `markUrl` and puts `data-header-brand=""` on the home link
  for the measuring script.
- **`ImageWithFallback`** gains an optional `sources` prop that wraps the `<img>` in
  `<picture class="contents">`. This was needed because `tests/storefront-image-fallback.test.ts`
  allows only that file to write a JSX `<img>`. Making it the `<picture>` is how R20 (one download)
  is met.
- **`scripts/verify-mobile-layout.ts`** adds a `brand` field: `file`, `fallback`, `width`,
  `height` and `requested`.
- **Test guard update.** `tests/storefront-image-fallback.test.ts`'s `SURFACES` now names
  `HeaderBrand.tsx` instead of `Header.tsx`, because the header images moved there.
- **Tests:** `lib/vendor-mark.test.ts`, `lib/vendor-icons.test.ts`, `tests/favicon-route.test.ts`,
  `tests/vendor-mark-action.test.ts` and `tests/header-brand.test.tsx` (48 tests).
- **Fixture:** `tests/fixtures/brand-mark-placeholder.png`. It is 1024×1024 with a transparent
  margin, a grey rounded square and a light triangle, and has no text and no vendor branding.
- **Docs:** a `specs/design-system.md` 1.20.0 section, admin guide 2.12.0 (`/staff/storefront`),
  and a `CHANGELOG.md` entry under Added.

## Decisions taken during the build

- **Migration SQL from `prisma migrate diff`, not `migrate dev --create-only`.** Against dev,
  `--create-only` demands a reset (checksum drift on `20260820200500_p8_image_needs_review`, the
  known trap `#895`). The diff was taken from `origin/staging`'s schema to the new one. The SQL is
  the single `ADD COLUMN`, with a comment header.
- **Mechanism for R20 is a `<picture>`.** The `<img>` is the mark (the default below `md`) and a
  `(min-width: 768px)` `<source>` holds the logo. The box swaps with `size-10 … md:w-auto
  md:aspect-9/5`. `class="contents"` keeps the `<img>` as the flex item. The both-images fallback is
  one `<span role="img">` carrying the same responsive box. Rejected: two `<img>`s toggled with
  `md:hidden`, which would download both.
- **The header uses `192.png`**, not `512.png`: 40px at up to 4.8× DPR is enough.
- **The uploader's cream is the SAVED `brandCream`**, not an unsaved edit in the colour form. The
  guide says "your saved Surface Brand Color (Cream)".
- **Size refusal message** for `requestMarkUpload` reuses the logo's "Images must be under N MB."
  `attachVendorMark` returns three distinct errors: incomplete upload, not PNG, and over the limit.
- **`/favicon.ico` 404s (does not throw) if the profile read fails**, matching `generateMetadata`'s
  degrade-don't-break guard. `dynamic = "force-dynamic"`, because the result depends on the
  request host.
- **The `brand.requested` caveat.** Chrome may record no resource-timing entry for a memory-cache
  hit, so the script comment and `validation.md` R20 say to measure 360 and 1024 in **separate**
  invocations.
- **Validation doc edits made during Build** (before any validation): R8 no longer says
  `python -I` (PIL is a user-site package, so `-I` cannot import it), and R20 gained the
  separate-invocations instruction.

## Deviations from the spec

None. Every R1–R27 item was built as written. The two `validation.md` wording fixes above clarify
how to run a check and do not change any requirement.

## Known-shaky areas

- **`app/favicon.ico/route.ts` under OpenNext/workerd has not been exercised.** `next build`
  registers it (`.next/app-path-routes-manifest.json` has `/favicon.ico/route`), but no
  `npm run preview` was run in this context. Next has a file convention for `app/favicon.ico`; a
  *directory* of that name with a `route.ts` worked in `next build`, but check R15's `curl -si`
  first. If the route 404s for a vendor with a mark, suspect a static-asset handler intercepting
  `.ico` before the Worker.
- **The canvas output (R8) is untested by any automated test.** jsdom has no canvas. The geometry
  is unit-tested; the actual pixels are only checked in R8's browser step. Check in particular:
  - `imageSmoothingQuality` support;
  - `toBlob` producing `image/png`;
  - the 180/og cream fill matching `brandCream` exactly (PNG is lossless, so pixel (0,0) should
    equal it).
- **Presigned PUT with `Content-Type: image/png`.** The logo path only ever PUT `image/webp`. If the
  bucket's CORS `AllowedHeaders` or the presigner pins anything per type, the first real upload
  fails with an HTTP status in the UI. Run `scripts/verify-storage-credentials.ts` first.
- **The `<picture>` swap at exactly 768px**, plus the hover/opacity classes carried onto the
  `<picture>` path. R18 measures at 768 and 1024.
- **Full-suite `npx vitest run` is flaky on this machine.** Each of three runs failed 2–3 different
  tests, all `Test timed out in 5000ms`:
  - run 1: `add-to-cart-feedback`, `storefront-chrome-rewards-gate`;
  - run 2: `product-grid-usage`, `repository-purity`;
  - run 3: `pagination-guard-coverage`, `slot-capacity`.

  Every one passed when run alone, and none touches this slice except `repository-purity`, which
  passes alone. Treat CI as ground truth (R25/R27).
- **Not run in this context:** `npm run preview`, any E2E row, and CI.
- **Unrelated data change on staging this session** (no code): Aheed got a vendor theme, "Aheed
  brand kit — original green", so the pre-rebrand palette can be re-applied. Production's
  equivalent is a user-run command, not done here.

## Fix after the first Validate (2026-10-13)

The first `/validate` failed two rows. Both were corrected at the root cause; no `validation.md`
row was loosened.

- **R8, the success preview.** `VendorMarkUploader` previewed the new `192.png` with
  `URL.createObjectURL`. The site CSP (`next.config`) has `img-src 'self' data: https://*.nocaped.com`,
  with no `blob:`, so the preview was a broken image in every environment. It now reads the blob into
  a `data:` URL (`blobToDataUrl`, `FileReader`), which the CSP already allows. A failed read leaves
  no preview rather than throwing, because the mark is already attached at that point. The CSP was
  not widened. `VendorLogoUploader` has the same latent bug; it predates this slice and is left for
  its own issue.
- **R23.** `specs/design-system.md` front-matter `updated` is now `2026-10-13`, the build date.
  Staging already carried `2026-10-12`, so the row's "changed versus `origin/staging`" check failed.

### Found by Validate, not fixed here (environment or Spec-level)

- **The dev R2 bucket has no CORS rule for any localhost origin.** A browser PUT from
  `npm run preview` is refused at preflight (403), for the logo uploader too. ADR-003 treats bucket
  CORS as a per-environment prerequisite outside the repo. The browser→R2 PUT was therefore not
  exercised locally. The canvas output was checked in the page, and generated files went through
  the real `requestMarkUpload`/`attachVendorMark` actions.
- **The `nocaped.com` zone's hotlink rule refuses `.png` (not `.webp`) for any off-zone `Referer`.**
  Measured: `192.png` returns 403 with `Referer: http://localhost:8787/` or `https://srimart.example.com/`,
  and 200 with `https://staging.aheedfoodcentre.nocaped.com/` or no Referer. Staging and production
  are on-zone, so nothing breaks today. A vendor on a custom domain outside `nocaped.com` would lose
  its header mark, favicon and touch icon. That is a **Spec-level** decision (PNG vs WebP, or a zone
  rule change), not a Fix. `docs/developer-portal/env-setup.md`'s "dev has no hotlink rule" is wrong
  for PNGs.
- **R16 was only partly verified locally.** Dev's `demo-srimart-admin` rejects the shared
  `DEMO_ACCOUNT_PASSWORD` (`demo-accounts add` sets a password only on creation). The cross-vendor
  leak check passed live; SriMart's own upload is to be checked on staging.
