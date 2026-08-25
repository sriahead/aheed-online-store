# P8.5e — Staff-Editable Hero Campaigns (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `grep -A 15 "^model DepartmentCampaign" prisma/schema.prisma` shows every listed field with the stated types/modifiers, including `categoryId String @unique` and `@@index([vendorId, isActive])`. |
| R2  | With `DIRECT_URL` pointed at a non-production Neon branch, run `npx prisma migrate dev --create-only` after the schema change, inspect the generated SQL contains only `CREATE TABLE "DepartmentCampaign"` + its indexes/FKs (no hand-written statement), then `npx prisma migrate deploy` and `npx prisma migrate status` — exits reporting the migration applied and the schema in sync, no drift. |
| R3  | `npx vitest run tests/repository-purity.test.ts` passes with `lib/repositories/campaigns.ts` included in its scanned file set (confirm via `git grep -l campaigns tests/repository-purity.test.ts` or the test's own file glob). |
| R4  | `grep -n "getPrisma\|getCurrentVendorId\|headers(" lib/campaigns-service.ts` shows the request-scoped calls living there, and the same grep against `lib/repositories/campaigns.ts` shows none. |
| R5  | `npx vitest run` on the new unit test file for `isCampaignLive` (e.g. `tests/campaigns.test.ts`) passes, with visible cases for: no dates: live; only future `startsAt`: not live; only past `endsAt`: not live; both dates spanning now: live; both dates in the past: not live. |
| R6  | `grep -n "campaign" components/layout/DepartmentHero.tsx` shows the `HeroDepartment` interface's new optional field. |
| R7  | Under `npm run preview`, seed one vendor's top-level category with a live campaign (`isActive: true`, no dates, a headline distinct from the category name) and fetch `/` — the rendered HTML's hero panel `<h2>` contains the campaign headline, not the category name, and (if `subtitle` set) a paragraph with that subtitle text is present. |
| R8  | Same live-campaign fixture, with `imageKey` set to a real uploaded key — fetched HTML shows an `<img>` covering the panel (not the small 128–160px thumbnail slot) and no `.dept-chevron` element in that panel's markup. Because this is a raster image, confirm on a **deployed** environment (staging), not local preview, per CLAUDE.md's CDN hotlink-protection note — or use an `.svg` fixture to check locally first. |
| R9  | Fetch `/` for a department with **no** campaign row at all — HTML is byte-for-byte unchanged from a fetch taken before this slice's `DepartmentHero` changes (diff the two responses' hero section). |
| R10 | Same live-campaign fixture as R7/R8 — the price callout markup (`department.spotlight`'s product name/price) is present in that panel's HTML alongside the campaign heading. |
| R11 | Set a campaign's `linkUrl` to a distinct path; fetched HTML's CTA `<a href>` matches it. Clear `linkUrl` to null; CTA `href` reverts to `/categories/{slug}`. In both cases the visible link text still reads "Shop {department name}", not campaign text. |
| R12 | `npx vitest run tests/department-hero.test.tsx` — same pass count as recorded in P8.5b's build-notes (no assertions edited to accommodate this slice). |
| R13 | Signed in as a vendor's `ADMIN`, `npm run preview` and load `/staff/promotions` — every top-level category from `/staff/categories` appears, each labelled No campaign / Inactive / Active (Scheduled / Live / Expired where dates are set). |
| R14 | Sign in as a non-staff customer account, load `/staff/promotions` — response shows the `<PanelRefusal>` markup (matches the text pattern used on `/staff/categories`'s refusal), not a blank shell and not a 500. |
| R15 | Submit the edit form for one department with a new headline; confirm via a DB read (or the page's own re-render) that the row updated, then submit the same form signed out — action returns a refusal (checked directly, e.g. a `tsx` script calling the exported action with no session) rather than writing. |
| R16 | `grep -n "^export" features/admin/campaigns.ts` (or wherever the action lives) lists only `async function` exports — no `export const`. |
| R17 | `grep -n "revalidatePath" features/admin/campaigns.ts` shows the call with `"/"`/`"layout"` arguments in the save action. |
| R18 | `grep -n "fitWithinEdge\|IMAGE_QUALITY\|IMAGE_CONTENT_TYPE" components/staff/CampaignBannerUploader.tsx` shows imports from `@/lib/product-image`, not redeclared locally. |
| R19 | Trace one successful upload under `npm run preview`: `requestCampaignImageUpload` returns `{url, key}`; the PUT to `url` succeeds (200/204); `attachCampaignImage(key)` calls `headObject` — confirm by temporarily logging or by unit-testing the action with a stubbed storage service that a key never PUT is refused. |
| R20 | Call the attach action directly (a `tsx` script or unit test) with a key for a *different* category id, or a key missing the `.webp` suffix, or an extra path segment — confirmed refused, not silently accepted. |
| R21 | Submit the save action with `imageKey` set and `altText` empty/omitted — action returns an error result, no row written/updated with that combination. |
| R22 | `git diff` on `specs/decisions/ADR-004-multi-tenancy.md` shows decision 5's version bumped and new prose naming this slice, the staff UI, and the free-text risk explicitly. |
| R23 | `gh issue view 352 --json state,stateReason` shows either `CLOSED`/`COMPLETED` with a closing comment referencing this slice, or `OPEN` with `build-notes.md` recording why. |
| R24 | `git diff <base>..HEAD -- CHANGELOG.md` is non-empty and describes this slice. |
| R25 | `npm run lint && npm run typecheck && npm test -- --run && npm run format:check` — all exit 0. |
