# P8.5e — Staff-Editable Hero Campaigns (build notes)

## What changed and why

**`prisma/schema.prisma`** gains `DepartmentCampaign` (one row per top-level `Category`,
`categoryId @unique`), plus the `Vendor.campaigns` / `Category.campaign` back-relations. Migration
`20260825120000_p8_5e_department_campaign` was generated offline via `prisma migrate diff
--from-schema-datamodel <pre-slice schema> --to-schema-datamodel prisma/schema.prisma --script`
(no live database needed) rather than `prisma migrate dev`, and contains only generated
`CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE` statements — nothing hand-authored. `prisma format`
also realigned unrelated models' columns (`Product`, `Category`'s existing fields) as a side effect
of the new, wider `DepartmentCampaign?` field on `Category`; confirmed with `git diff -w
prisma/schema.prisma` that every one of those lines is whitespace-only.

**`lib/repositories/campaigns.ts`** — `listCampaignsByCategory`, `getCampaignForCategory`,
`upsertCampaign`, `setCampaignImage`, each taking `prisma`/`vendorId` explicitly (R3). `upsertCampaign`
re-checks the category belongs to the vendor before writing, matching `checkParent`'s posture in
`lib/repositories/categories.ts`. `setCampaignImage` refuses to create a row — see Decisions below.

**`lib/campaign-liveness.ts`** (new, not named in the spec) carries `isCampaignLive`, pulled out of
the repository file — see Deviations.

**`lib/campaigns-service.ts`** is now three things, not one: `getCampaignsForHero` (the original
request-scoped storefront read, memoised with React `cache()`), plus four thin
`getPrisma()`-constructing wrappers (`listCampaignsForVendor`, `getCampaignForVendorCategory`,
`saveCampaignForVendor`, `saveCampaignImageForVendor`) that exist only because of a lint rule — see
Deviations.

**`lib/campaign-form.ts`** / **`lib/campaign-image.ts`** — pure, import-free, mirroring
`lib/catalogue-form.ts` and `lib/product-image.ts`'s shapes respectively. `campaign-form.ts` reuses
`RawForm`/`ParseResult`/`FieldError`/`readForm` from `catalogue-form.ts` rather than redeclaring
them. `campaign-image.ts` reuses `IMAGE_CONTENT_TYPE`/`MAX_IMAGE_BYTES`/`MAX_IMAGE_EDGE_PX`/
`IMAGE_QUALITY`/`fitWithinEdge` from `product-image.ts` directly (R18) — only the key-shape
functions (`categories/{categoryId}/{uuid}.webp`) are new.

**`features/admin/campaigns.ts`** (`saveCampaign`) and **`features/admin/campaign-image.ts`**
(`requestCampaignImageUpload`, `attachCampaignImage`) — modelled on
`features/admin/storefront.ts`'s vendor-logo pair almost line-for-line, including the
headObject-verify-before-write step and the delete-on-mismatch cleanup.

**`/staff/promotions`** (list) and **`/staff/promotions/[categoryId]`** (edit) — same
`requireVendorRole("ADMIN")` + `<PanelRefusal>` shape as `/staff/categories`. The edit route is
keyed on the *category's* id, not a campaign id, since `upsertCampaign` creates the row on first
save — there is no separate "new campaign" URL. `PanelNav.tsx` gained a "Promotions" link between
Categories and Storefront.

**`components/staff/CampaignForm.tsx`** / **`CampaignBannerUploader.tsx`** — the former mirrors
`CategoryForm.tsx`'s `useActionState` wiring; the latter is close to a straight copy of
`VendorLogoUploader.tsx`, scoped to a category instead of the vendor.

**`components/layout/DepartmentHero.tsx`** — `HeroDepartment` gains an optional `campaign` field
(headline/subtitle/imageKey/altText/linkUrl — no `isActive`/dates, deliberately: liveness is decided
once, by the caller, before this component ever sees the value). A panel with a live campaign that
has a photo renders it full-bleed with a gradient scrim, drops the `.dept-chevron` cutout for that
panel only, and shows the campaign's headline/subtitle above the **unchanged** real-price spotlight
callout. A panel with no live campaign, or a live one with no photo, is byte-for-byte identical to
pre-slice output (proven by `tests/department-hero.test.tsx`'s "renders identically" test, which
diffs rendered HTML against a `campaign: undefined` render rather than asserting shape).

**`app/(storefront)/page.tsx`** now reads `getCampaignsForHero(categoryIds)` alongside spotlights,
decides liveness once with `isCampaignLive(campaign, now)`, and passes only the already-live subset
into `heroDepartments`.

**`specs/decisions/ADR-004-multi-tenancy.md`** amended 1.7.0 → 1.8.0 (committed with the spec, not
this build commit) — decision 5 now names this slice as the "general campaign surface" the
2026-08-24 amendment deferred, and states the accepted free-text risk explicitly.

## Decisions taken during the build

- **`setCampaignImage` refuses to create a `DepartmentCampaign` row.** A department must have a
  headline saved first; uploading a banner before that returns "Save the campaign's headline before
  adding a photo." rather than upserting a headline-less row. Mirrors `attachProductImage`'s
  posture (operates on an entity that already exists) and avoids inventing a placeholder headline
  (which would repeat the #239 failure in a new place — a value nobody actually wrote).
- **`linkUrl` is validated as a relative path** (`starts with "/"`, not `"//"`), refused rather than
  normalised — matches the deleted `VendorPromotion.linkUrl`'s documented convention, which was
  comment-only before; this slice is the first to actually enforce it (`tests/campaign-form.test.ts`
  covers absolute and protocol-relative refusal).
- **The CTA button's visible label stays "Shop {department.name}"**, never campaign text, even
  when a campaign supplies a `linkUrl` override — recorded in `plan.md` as a deliberate narrowing
  of the approved direction, re-confirmed here: one fewer free-text a11y surface than the prototype
  or the original preview implied.
- **`/staff/promotions` lists ONLY top-level categories**, filtered from
  `listCategoriesForAdmin`'s full result rather than adding a new repository query — `DepartmentHero`
  only ever renders `listTopLevel()`'s output, so a campaign on a sub-category would have nowhere to
  render (plan.md's Deliberately excluded).
- **Full-bleed treatment is per-panel, not per-hero.** A vendor can have some departments with
  photographic campaigns and others still icon-led in the same rotation — deliberately, since a
  department earns the photographic treatment by having real artwork, not by another department
  having one.

## Deviations from the spec

**`isCampaignLive` lives in a new file, `lib/campaign-liveness.ts`, not in
`lib/repositories/campaigns.ts` as plan.md implied.** Requirements.md's R5 didn't name a file, but
plan.md's prose put it beside the other repository functions. Reason: `lib/repositories/campaigns.ts`
imports `getPrisma` from `@/lib/db`, which imports `@prisma/client/wasm` — importing *anything*
from that file, including a function that never touches Prisma, pulls that chain in. A plain vitest
unit test failed on this before it was moved (would have failed the same way in `next build`'s
client bundle, if a component ever imported it directly). Same posture `lib/product-image.ts`
already established for exactly this reason. `lib/repositories/campaigns.ts` now has a code comment
pointing at the new file instead of a re-export, because a re-export would still trigger the same
transitive import.

**`lib/campaigns-service.ts` gained four exports requirements.md didn't ask for**
(`listCampaignsForVendor`, `getCampaignForVendorCategory`, `saveCampaignForVendor`,
`saveCampaignImageForVendor`), and `features/admin/campaigns.ts` / `features/admin/campaign-image.ts`
/ both `/staff/promotions` pages call them instead of `getPrisma()` + the repository functions
directly. Reason, found at `npm run lint` during Build: `eslint.config.mjs` has a
`no-restricted-imports` rule (ADR-004 slice 2) banning `@/lib/db` from `app/**`, `features/**` and
`components/**` entirely — not checked when requirements.md's R3 asked for `prisma` as an explicit
parameter on the repository functions. Two ways to reconcile: change R3's functions to resolve
`getPrisma()` internally (matching `lib/repositories/categories.ts`'s admin-write functions), or
keep R3 exactly as specced and add a thin wrapping layer in `lib/campaigns-service.ts` (which,
unlike `app/`/`features/`/`components/`, is not covered by the restricted-imports rule). Took the
second option — R3's functions stay driveable from a plain `tsx` script with no live request, and
the wrappers are one line each.

**Issue #352's literal ask is only partly covered.** #352 asked for a department to get real
artwork with NO other change — icon swaps for a photo, name and real price stay exactly as
`DepartmentHero` already renders them. What this slice built ties a photo to an active campaign,
which also requires a `headline` (campaign copy replaces the department name, not just the icon).
A vendor who wants a photo but no marketing copy change cannot get that with what exists today —
they write *some* headline (even the department's own name, verbatim) to attach an image. Closing
#352 as superseded on the reasoning that the underlying need (real vendor artwork reaching the hero)
is met, with this gap named in the closing comment rather than glossed over.

## Known-shaky areas

Look here first, in this order:

1. **The migration has never been run.** Same situation P8.5b's was: `prisma validate` passes and
   the SQL is generated, but nothing has applied it to any database. `deploy-staging`'s CI step
   (`npx prisma migrate deploy` against `DIRECT_URL`) is what will actually run it, on merge — not
   validated locally first, same as P8.5a/b's precedent (both of which then also stayed unrun until
   merge, per #235 in the P8.5b build).
2. **The full-bleed photographic panel has never been seen with a real uploaded image**, only with
   a `imageKey` string set directly in a test fixture. The client-side `toWebp()` resize/encode path
   (`CampaignBannerUploader.tsx`, copied from `VendorLogoUploader.tsx`) has no automated coverage at
   all in either component — canvas/`createImageBitmap` needs a real browser.
3. **Per-vendor rendering (R9-adjacent, not a numbered requirement here) is unverified.** Same
   caveat as every prior slice, per #251's precedent: nothing confirms a SriMart campaign panel
   (blue/purple/red palette) renders correctly rather than just Aheed's green.
4. **The `linkUrl` relative-path check is new enforcement, not a port of existing behaviour** — the
   deleted `VendorPromotion.linkUrl` never actually validated this at runtime, only documented it in
   a comment. If any other part of this repo relied on a lenient `linkUrl`, this is the first place
   that would surface it — nothing else in this slice touches that field.
5. **The `/staff/promotions` list's status labels (Live/Scheduled/Expired/Inactive/No campaign)
   are new UI copy with no test coverage** — `isCampaignLive` itself is unit-tested (9 cases), but
   the list page's `statusLabel()` function that layers the extra Scheduled/Expired distinction on
   top of it is not.
6. **`setCampaignImage`'s "row must already exist" refusal has no test exercising the refusal path
   itself** — `tests/campaign-image.test.ts` covers the key-shape rules and the action module's
   export shape, not a full request → refusal round trip (would need a stubbed Prisma client).
