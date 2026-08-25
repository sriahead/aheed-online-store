# P8.5e — Staff-Editable Hero Campaigns (requirements / acceptance criteria)

Closes out #356 (P8.5e), approved at `/propose`. Builds on `DepartmentHero` (#346,
`specs/2026-08-24-p8.5b-department-hero/`) and reuses the presign/attach image-upload pattern from
`features/admin/product-image.ts` / `components/staff/VendorLogoUploader.tsx`. One paragraph
version of `plan.md`: a new `DepartmentCampaign` model (one row per top-level category) gives staff
a real CRUD surface to upload a banner photo and write a headline/subtitle for a department; when a
campaign is live, `DepartmentHero` renders it as a full-bleed photographic panel instead of today's
icon-corner layout, with the real product-price callout still rendering underneath. A department
with no live campaign is unaffected — same output as before this slice.

**Schema & data**

R1. `prisma/schema.prisma` defines `DepartmentCampaign` with `vendorId`, `categoryId` (`@unique`),
    `headline` (`String`, required), `subtitle` (`String?`), `imageKey` (`String?`), `altText`
    (`String?`), `linkUrl` (`String?`), `isActive` (`Boolean @default(true)`), `startsAt`
    (`DateTime?`), `endsAt` (`DateTime?`), `createdAt`, `updatedAt`, and `@@index([vendorId,
    isActive])`.

R2. A migration exists that creates `DepartmentCampaign` and contains no hand-authored DDL — the
    entire table is generated from the schema declaration, so `npx prisma migrate diff
    --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma
    --shadow-database-url $DIRECT_URL` (or `prisma migrate status`) reports no drift once applied.

R3. `lib/repositories/campaigns.ts` exports `listCampaignsByCategory`, `getCampaignForCategory`,
    and `upsertCampaign`, each taking `prisma` and `vendorId` as explicit parameters and reading no
    request context (no value import of `next/headers`, `@/lib/tenant`, `@/lib/auth`, or
    `@/lib/auth-rbac`).

R4. `lib/campaigns-service.ts` provides the request-scoped facade (resolves the live Prisma client
    and current vendor, wraps `lib/repositories/campaigns.ts`'s pure functions) — it does not live
    inside `lib/repositories/campaigns.ts`.

R5. A pure function `isCampaignLive(campaign, now)` returns true iff `isActive` is true and
    (`startsAt` is null or `startsAt <= now`) and (`endsAt` is null or `endsAt >= now`); unit-tested
    against all four combinations of present/absent `startsAt`/`endsAt`, plus one case each for
    "not yet started" and "already ended".

**Rendering (`DepartmentHero`)**

R6. `HeroDepartment`'s type gains an optional `campaign: { headline: string; subtitle: string |
    null; imageKey: string | null; altText: string | null; linkUrl: string | null } | null` field.

R7. A panel whose department has a live campaign (per R5) renders `campaign.headline` as its `<h2>`
    heading in place of `department.name`, and `campaign.subtitle` as a paragraph when it is
    non-null.

R8. A panel whose live campaign has a non-null `imageKey` renders that image as a full-bleed
    background (`object-cover`, filling the panel) with a text-legibility scrim, replacing the
    existing small corner icon/thumbnail for that panel only; the `.dept-chevron` cutout does not
    render on this panel.

R9. A panel with no live campaign, or a live campaign with no `imageKey`, renders identically to
    `DepartmentHero`'s current (pre-this-slice) output — same markup, same icon/thumbnail
    treatment, same chevron.

R10. The product spotlight price callout (`department.spotlight`) renders on every panel exactly as
     it does today, regardless of whether a live campaign is present — a campaign's copy is never
     the only thing shown; the real price callout is never suppressed by it.

R11. A panel's "Shop {name}" CTA links to `campaign.linkUrl` when the live campaign supplies a
     non-null one, otherwise to the existing default `/categories/{slug}`; the button's visible
     label text is unchanged ("Shop {department.name}"), never sourced from campaign data.

R12. `DepartmentHero`'s existing rotation/pause/keyboard-focus/`prefers-reduced-motion` behaviour
     and its existing test coverage are unmodified by this slice — no test in
     `tests/department-hero.test.tsx` (or equivalent) that predates this slice needs its assertions
     changed to keep passing.

**Staff CRUD**

R13. `/staff/promotions` lists every top-level category for the signed-in vendor
     (`listTopLevel()`), each showing whether it has no campaign, an inactive campaign, or an
     active campaign (further distinguishing "scheduled" / "live now" / "expired" when
     `startsAt`/`endsAt` are set).

R14. `/staff/promotions`'s non-staff-admin branch (`requireVendorRole("ADMIN")` fails) renders
     `<PanelRefusal title="..." message="..." />` — never `return null` and never a bare fallthrough.

R15. Each department's edit form submits headline, subtitle, link URL, start date, end date, and
     active toggle to a `"use server"` action that re-runs `requireVendorRole("ADMIN")` itself,
     independent of the page's own check.

R16. The `"use server"` action file backing this form exports only async functions — no sibling
     constant (e.g. initial form state) exported from the same file.

R17. Saving a campaign calls `revalidatePath("/", "layout")` so the change is visible on the
     homepage without a separate manual refresh path.

**Banner image upload**

R18. A new client component (e.g. `components/staff/CampaignBannerUploader.tsx`) lets staff replace
     one department's campaign banner image, resizing/re-encoding to WebP in the browser via the
     existing `fitWithinEdge`, `IMAGE_QUALITY`, and `IMAGE_CONTENT_TYPE` exports from
     `lib/product-image.ts` — no new duplicate constants for these values.

R19. The upload flow is presign-then-attach: a `requestCampaignImageUpload(categoryId, byteLength)`
     action returns a short-lived presigned PUT URL and a key; a separate
     `attachCampaignImage(categoryId, key, altText)` action calls `headObject` to confirm the
     object actually exists in storage (content type and size) before writing `imageKey`/`altText`
     to the row.

R20. The banner image key format is `categories/{categoryId}/{uuid}.webp`. `attachCampaignImage`
     refuses (does not normalize) any key that isn't exactly this shape for the category being
     edited.

R21. Saving a campaign with a non-null `imageKey` and a null/empty `altText` is rejected by the save
     action with an error, not silently stored.

**ADR & issue reconciliation**

R22. `specs/decisions/ADR-004-multi-tenancy.md` decision 5 is amended (version bumped) to record
     that this slice is the "general campaign surface" the 2026-08-24 amendment named as future
     work, built with a staff UI, and to name the accepted risk explicitly: `headline`/`subtitle`
     are free text, not derived from product or discount data, distinct from `imageKey`/`linkUrl`/
     schedule which stay structured.

R23. Issue #352 is either closed as superseded by this slice's banner upload, or left open with a
     recorded reason in `build-notes.md` for why it isn't fully covered — one or the other, not
     silently unaddressed.

**Gates**

R24. `CHANGELOG.md` updated (Gate 4).

R25. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
