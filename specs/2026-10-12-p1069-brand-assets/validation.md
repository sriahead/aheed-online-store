# Per-vendor brand assets (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

The risks in this slice:

- an additive migration;
- a public `GET /favicon.ico` route;
- a server action that deletes storage objects;
- client-side canvas image generation;
- a header change on every storefront and staff page.

How each kind of check runs:

- **Unit tests** cover the key helpers, the metadata builders, the favicon handler, `attachVendorMark`
  with a stubbed storage, and `HeaderBrand` rendered to static markup.
- **Integration and E2E checks** run under `npm run preview` against the **dev** Neon project, never
  `npm run dev`, which cannot load the WASM engine.
- **Browser checks** need a real browser. Use the Claude-in-Chrome extension for the upload (a
  file input), and `scripts/verify-mobile-layout.ts` for widths below 501px. jsdom does no layout
  and no canvas, so a jsdom test cannot satisfy any layout or image row.

## Setup (once, before the Integration/E2E rows)

1. **Confirm which database is local.** Compare the `DATABASE_URL`/`DIRECT_URL` hosts in `.env` and
   `.dev.vars` against `secrets/staging.vars` and `secrets/production.vars`, printing hosts only.
   They must match **neither** of those files.
2. **Migrate dev.** Run `npx prisma migrate status`. If this slice's migration is pending, ask the
   user to run `! npx prisma migrate deploy`, because auto mode blocks it. Re-run status until it
   reports "Database schema is up to date!".
3. **Storage.** Run `npx tsx scripts/verify-storage-credentials.ts`; it must be green. Broken S3
   credentials only show up on writes (CLAUDE.md).
4. **Start the preview.** Kill leftover `workerd` and `node` preview processes, then run
   `npm run preview` and wait for `GET / 200`. Aheed is `localhost:8787`, SriMart is
   `srimart.localhost:8787`. For headless Chrome, add
   `--host-resolver-rules="MAP srimart.localhost 127.0.0.1"`.
5. **Snapshot.** Use a read-only `tsx` script (`PrismaClient` with `PrismaNeon`) to save Aheed's and
   SriMart's `VendorBranding.logoStorageKey` and `markStorageKey`. After the last row, set
   `markStorageKey` back to the snapshot values for both vendors and confirm the diff is empty.
6. **Sign in** as `demo-store-admin@example.com` with `DEMO_ACCOUNT_PASSWORD` taken from
   `.dev.vars`, as in `docs/developer-portal/local-dev-playbook.md`. Never print the password.
7. **Fixtures.** Use `tests/fixtures/brand-mark-placeholder.png`: a square, at least 512px, added
   by this slice. Also make two throwaway images in the scratchpad: a 300×300 PNG (too small) and a
   1024×512 PNG (non-square).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Integration | Run `git diff --name-only --diff-filter=A origin/staging -- prisma/migrations`. It lists exactly one new `migration.sql`. Read it in full. It has one `ALTER TABLE "VendorBranding" ADD COLUMN "markStorageKey" TEXT`, no `NOT NULL`, no `DROP`, no `_trgm`, and no other table. Run `grep -n "markStorageKey" prisma/schema.prisma`; it matches one line, `markStorageKey String?`, inside `model VendorBranding`. |
| R2 | Unit | Run `npx vitest run lib/vendor-mark.test.ts`; it passes. Read the test. It asserts each of the following:<br>• the folder shape and that two calls differ;<br>• the five derived keys for a valid key;<br>• `null` for each of these: a `.webp` suffix, a missing `mark-` segment, a non-UUID, a `../` segment, and a trailing slash;<br>• `isVendorMarkKey` is `false` for vendor B's key checked against vendor A.<br>Run `grep -n "process.env\|getPrisma\|headers()\|cookies()" lib/vendor-mark.ts`; it has no match. |
| R3 | Integration | Read `requestMarkUpload`. It starts with `requireVendorRole("ADMIN")`, validates all five lengths against `MAX_IMAGE_BYTES`, uses one `buildVendorMarkFolder` call, and calls `presignPut(…, "image/png", PRESIGN_TTL_SECONDS)` five times. Signed out under preview, POST the action (`Next-Action` header, ID from the `/staff/storefront` page). It returns the sign-in refusal. |
| R4 | Unit + Integration | Run `npx vitest run` on the `attachVendorMark` test file; it passes. Read the test. It has these cases:<br>• vendor B's key → `"Invalid upload key."`, with zero storage calls;<br>• `og.png` missing → `deleteObject` called for exactly the 4 present keys, and no repository write;<br>• `192.png` returned with `image/webp` → all 5 deleted, and no write;<br>• all valid → one write with the key, and `revalidatePath` called with `/staff/storefront` and with `"/", "layout"`.<br>Under preview, as the Aheed admin, POST `attachVendorMark` with `vendors/<SriMart id>/mark-<any uuid>/512.png`. It returns `Invalid upload key.` and both vendors' DB values equal the snapshot. |
| R5 | Unit | Run `grep -n "^export" features/admin/storefront.ts`; every match is `export async function`. Run `grep -n "MARK_FILES" features/admin/storefront.ts`; any match is an import, not a declaration. |
| R6 | Unit | Read the new repository function. Its signature takes `(prisma, vendorId, markStorageKey)` and it does a singular `update`/`upsert` with no nested `create`. Run `grep -n "updateMany\|createMany\|getPrismaWs" lib/repositories/vendor.ts`; it has no new match against `git show origin/staging:lib/repositories/vendor.ts`. Run `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts`; it passes. |
| R7 | E2E | Under preview, open `/staff/storefront` as the Aheed admin. There is a heading containing "Square mark", an `input[type=file]` with an `accept` attribute that starts with `image/`, and an Upload button. The help line names the browser tab, the home screen, link previews, and the header on phones. With no mark yet, there is no mark preview `img`. |
| R8 | E2E | Upload the fixture. The success state shows a preview. Read Aheed's `markStorageKey` from the DB: it matches `^vendors/<aheed id>/mark-[0-9a-f-]{36}/512\.png$`. For each of the five files, fetch `{cdn}/<folder>/<file>` and check:<br>• HTTP 200 and `content-type: image/png`;<br>• the decoded size equals `MARK_FILES` (use a scratchpad Python script with PIL, or `createImageBitmap` in the page);<br>• the alpha of pixel (0,0) is 0 in `32/192/512.png`, and pixel (0,0) of `180.png` and `og.png` equals Aheed's `brandCream`.<br>Then upload the 1024×512 image. In the new `512.png`, the pixel rows 0–127 and 384–511 are fully transparent (contained, not cropped), and the centre pixel is opaque. |
| R9 | E2E | Choose the 300×300 image and click Upload, with DevTools network recording (or `mcp__claude-in-chrome__read_network_requests`). The exact R9 message appears, no POST to the page and no PUT to storage are recorded, and the DB key is unchanged. |
| R10 | Unit + E2E | Read the uploader. A thrown `fetch` is caught and its message is shown, a non-ok `PUT` shows `HTTP ${status}`, and `attachVendorMark` is reached only after all five `PUT`s are ok. In the browser, block the CDN/storage host with `--block-urls`, or the extension's request blocking, and upload. An error is shown and the DB key is unchanged. If neither blocking method is available, record that this row was verified by reading only. |
| R11 | Unit | Run `npx vitest run` on the builders' test file; it passes. It has cases for: a mark with a CDN base; a null key; an unset CDN base; and a malformed key. The last three each assert `icons` and `openGraph` absent and manifest icons `[]`. |
| R12 | E2E | With Aheed's mark set (from R8), run `curl -s -H "Host: localhost:8787" http://127.0.0.1:8787/` and extract `<head>`. Check:<br>• `rel="icon"` links with `sizes="32x32"`/`type="image/png"` → `…/32.png` and `sizes="192x192"` → `…/192.png`;<br>• `rel="apple-touch-icon"` → `…/180.png`;<br>• `property="og:image"` → `…/og.png`, `og:image:width` `1200`, `og:image:height` `630`;<br>• `og:site_name` = Aheed's vendor name, and `og:type` `website`.<br>All URLs start with `CDN_BASE_URL` and contain `vendors/<aheed id>/`. |
| R13 | Unit + E2E | Run the same `curl` against `Host: srimart.localhost:8787`, after confirming SriMart's key is null. There is no `rel="icon"`, no `apple-touch-icon` and no `og:image`. The `<title>` equals `{name} — {tagline}` (or `{name}` with no tagline) and the description equals the tagline (or `Local delivery across {localityName}.`), using SriMart's DB values. The R11 builder test asserts that the no-mark result adds no keys to the metadata object. |
| R14 | E2E | `curl -s -H "Host: localhost:8787" http://127.0.0.1:8787/manifest.webmanifest`: `icons` has exactly 2 entries with the R14 `sizes`/`type`/`purpose` and Aheed's `192.png`/`512.png`. The same request for SriMart has `icons: []`. `name`, `short_name`, `theme_color` and `background_color` for each vendor match what the unchanged code derives from its profile. |
| R15 | E2E + Unit | `curl -si -H "Host: localhost:8787" http://127.0.0.1:8787/favicon.ico` returns `302`, `Location` → Aheed's `32.png`, and `cache-control: public, max-age=300`. The SriMart host returns `404`. A host with no vendor (`-H "Host: nobody.localhost:8787"`) returns `404`. Run `ls app/favicon.ico public/favicon.ico 2>&1`: `app/favicon.ico` is a directory containing `route.ts`, and `public/favicon.ico` does not exist. The handler's unit test passes. |
| R16 | E2E | Sign in as SriMart's admin and upload the fixture on `srimart.localhost:8787/staff/storefront`. If no SriMart admin credential is available on dev, stop and ask the user for one, and do not write the key directly. Repeat R12, R14 and R15 for both hosts. Every icon, manifest and `Location` URL contains only its own vendor's `vendors/<id>/`, and no Aheed URL appears in any SriMart response. |
| R17 | Unit | `HeaderBrand` exists, and `grep -n "getCurrentVendor\|headers()\|cookies()\|getSession" components/layout/HeaderBrand.tsx` has no match. `Header.tsx` renders `<HeaderBrand` with `markUrl` derived from `markFileKeys(...).icon192`. |
| R18 | Unit + E2E | Run `npx vitest run` on the `HeaderBrand` test; it passes, with four cases asserting the R18 markup (classes or `data-*` hooks showing visibility per breakpoint). For logo only and neither, compare against snapshot strings taken from `origin/staging`'s markup. In the browser on Aheed (logo and mark), run `npx tsx scripts/verify-mobile-layout.ts --base http://127.0.0.1:8787 --path / --widths 360,390,768,1024`. At 360/390, `brand.file` is `192.png` at 40×40 (±1). At 768/1024, `brand.file` is the logo key's final segment, with height 40 (±1) and width 72 (±1). To get the mark-only case, set Aheed's `logoStorageKey` to null via the snapshot script, re-measure at 360 and 1024: `brand.file` is `192.png` at 40×40, and the name text is present. Restore the logo afterwards. |
| R19 | Unit + E2E | Read `HeaderBrand`. Each `<img>` path goes through `ImageWithFallback` with the R19 `alt`, and each box has explicit size classes (`size-10` / `h-10 aspect-9/5`) on the element that renders before load. In the browser, block `192.png` (`--block-urls 192.png`) at 360. `brand` reports the fallback at 40×40, and `documentScrollWidth` equals 360. |
| R20 | E2E | Use `verify-mobile-layout.ts`'s `brand.requested` list, which per R21 comes from `performance.getEntriesByType("resource")` filtered to `initiatorType === "img"`. Favicon and manifest fetches are not image-element requests and are excluded. Run `--widths 360` and `--widths 1024` as **separate** invocations, because a memory-cache hit from an earlier width may produce no entry. At 360 the list contains `192.png` and not the logo key; at 1024 it contains the logo key and not `192.png`. |
| R21 | Unit | Run `git diff origin/staging -- scripts/verify-mobile-layout.ts`. It only adds the `brand` field and the request capture, and no field is removed or renamed. The R18 run exits 0. |
| R22 | E2E | In the same R18 run, `documentScrollWidth` equals the width at each of 360, 390, 768 and 1024. |
| R23 | Unit | Read `specs/design-system.md`. The `Brand assets: lockup and mark (#1069)` section contains each R23 item, and the front-matter `version` and `updated` changed versus `origin/staging`. |
| R24 | Unit | Read the `/staff/storefront` section of `docs/store-admin-guide/admin-tabs-guide.md`. It names "Square mark", its uses, `512`, and re-uploading after a colour change. Each sentence maps to a control seen in R7. Run `npm run kms:check-generated`; it exits 0. |
| R25 | Unit | Run `npx vitest run` alone (no build running). Every test file named in R2, R4, R11, R15 and R18 runs and passes, and the run reports no "failed to start" or skipped files. |
| R26 | Unit | Run `git diff origin/staging -- CHANGELOG.md`; it shows an added entry containing `#1069`. |
| R27 | Unit | `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, `npm run kms:validate` and `npm run kms:check-generated` each exit 0. Then run `npx vitest run` separately (R25). CI on the PR is green. |
