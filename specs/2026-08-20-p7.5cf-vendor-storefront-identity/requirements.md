# P7.5c+f — Per-vendor storefront identity (requirements / acceptance criteria)

Closes #239 (Aheed's marketing copy renders for every vendor), #233 (no per-vendor hero image) and
#255 (per-vendor semantic colours have no AA guarantee). Builds on ADR-004 decision 5 (branding is
data, delivered as CSS variables), ADR-003 (relative storage keys, never URLs), and #251's finding
that `brandStyle()`'s inline style outranks `tokens.css`. In one line: the storefront's words,
offers and colours become this vendor's, and the colours pass WCAG AA by construction rather than by
curation.

Throughout, **"rendered"** means the HTML body returned by a request to a running `npm run preview`,
not JSX source and not `npm run dev` — per `CLAUDE.md`, `next dev` cannot load
`@prisma/client/wasm` and renders a DB-backed page as a silent error state.

## Schema and data

R1. `prisma/schema.prisma` adds `bannerNote String?` and `heroSubtitle String?` to `VendorConfig`,
    and adds no field to `VendorBranding`.

R2. `prisma/schema.prisma` declares `model VendorPromotion` with fields `id`, `vendorId`, `title`
    (required), `description` (required), `imageKey String?`, `altText String?`, `linkUrl`,
    `sortOrder Int`, `isActive Boolean`, `createdAt`, `updatedAt`; a `vendor` relation with
    `onDelete: Cascade`; and `@@index([vendorId, isActive, sortOrder])`. No `Json` field.

R3. A new directory under `prisma/migrations/` contains a migration that adds the two `VendorConfig`
    columns and creates the `VendorPromotion` table and its index. Its `ALTER TABLE` statements
    against pre-existing tables contain no `DROP`, no `NOT NULL` and no `UPDATE`.

R4. `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource
    prisma/schema.prisma --exit-code` exits `0` (no drift) against the dev database after the
    migration is applied.

R5. `prisma/seed.ts` sets a non-null `bannerNote` and `heroSubtitle` for both Aheed and SriMart.
    Neither vendor's values name a trade belonging to the other.

R6. `prisma/seed.ts` creates at least two `VendorPromotion` rows for **each** vendor, all with
    `isActive: true`, `imageKey: null`, distinct `sortOrder` values within a vendor, and a `linkUrl`
    that is a relative path beginning `/`. The seed is idempotent — running it twice leaves the same
    number of promotion rows.

R7. `VendorProfile` in `lib/repositories/vendor.ts` declares `bannerNote: string | null` and
    `heroSubtitle: string | null`; `fetchVendorProfile` names both in its Prisma `select` and maps
    each with a `?? null` fallback.

## Promotions data access

R8. `lib/repositories/promotions.ts` exports `listActivePromotions` taking a Prisma client and a
    `vendorId` as explicit parameters, filtering on both `vendorId` and `isActive: true` and
    ordering by `sortOrder` ascending.

R9. `lib/repositories/promotions.ts` contains no call to `getCurrentVendorId`, `getCurrentVendorIdOrNull`,
    `headers(` or `getAuth(`, and the request-scoped accessor for promotions is exported from
    `lib/promotions-service.ts` instead.

R10. `tests/repository-vendor-scoping.test.ts` passes without adding `lib/repositories/promotions.ts`
     or any of its exports to the nine-entry legacy allowlist.

## Storefront copy (#239)

R11. `components/layout/Header.tsx` renders its second banner element only when `profile.bannerNote`
     is non-null, and that element's text content is `profile.bannerNote`, not a literal.

R12. The header's first banner line interpolates only `name` and `localityName` into copy naming no
     trade or product category.

R13. `app/(storefront)/page.tsx` renders the hero's supporting paragraph only when
     `profile.heroSubtitle` is non-null, and its text content is that value.

R14. The hero renders at most two badges, both derived from `VendorConfig`: a free-delivery badge
     rendered only when `freeDeliveryThresholdPence` is non-null, and a minimum-order badge rendered
     only when `minimumOrderPence` is greater than zero, each showing its value through
     `formatPrice`. `app/(storefront)/page.tsx` contains no `£`-followed-by-digit literal.

R15. Rendered `/` for Aheed contains `£30.00` and `£15.00` and neither `£50.00` nor `£10.00`;
     rendered `/` for SriMart contains `£50.00` and `£10.00` and neither `£30.00` nor `£15.00`.

R16. The trust strip renders exactly three tiles. One interpolates `localityName`; the other two
     describe capabilities this repo implements (Stripe card payment, order-status email) and name no
     trade or product category.

R17. Rendered `/` for SriMart's host contains none of the case-insensitive substrings `halal`,
     `grocer`, `fresh produce`, `meat`, `spice`, `lentil` or `cultural staple`.

## Promotions rendering (#233)

R18. `components/layout/PromoSlider.tsx` no longer exists, and no file under `app/`, `components/` or
     `features/` **imports it or renders it as a JSX element** — target `^import.*PromoSlider` and
     `<PromoSlider`, not the bare word. `PromoCarousel.tsx`'s doc comment names `PromoSlider` twice,
     to record what it replaced and why the auto-rotation was not copied across; a bare-word grep
     would "pass" only by deleting that explanation. This is the P4a trap (see
     `specs/sdd-workflow.md`), hit for the fourth time in this repo — the first three were R5 and
     R27 in P4a and R17/R22 in P7.5b.

R19. The hero renders a promotions carousel populated from `listActivePromotions` for the resolved
     vendor, in ascending `sortOrder`, showing only `isActive` rows.

R20. A promotion with `imageKey: null` renders its `title` and `description` with no `<img>`
     element; a promotion with a non-null `imageKey` renders an `<img>` whose `src` is produced by
     `composePublicUrl` from `lib/storage.ts` and whose `alt` is that row's `altText`.
     `app/(storefront)/page.tsx` and the carousel component contain no `http`-scheme image URL
     literal.

R21. When a vendor has no active promotions, `/` returns HTTP 200 and renders no carousel and no
     empty carousel container.

R22. The carousel does not auto-advance without a user-operable control: either it performs no
     timed rotation, or it renders a button that pauses and resumes rotation and carries an
     accessible name. (WCAG 2.2 SC 2.2.2.)

R23. Rendered `/` for each host contains that vendor's own seeded promotion titles and none of the
     other vendor's.

## Contrast clamp (#255)

R24. `lib/color-contrast.ts` exists, contains no `import` statement, and exports `contrastRatio` and
     `clampForContrast`.

R25. `clampForContrast(fg, backgrounds, minRatio)` returns a 6-digit lowercase hex string for every
     tested input, and returns its input unchanged when that input already meets `minRatio` against
     every entry of `backgrounds`.

R26. For each of `#1e88e5`, `#4caf50`, `#f57c00` and `#d32f2f` clamped against `["#ffffff"]` at
     `4.5`, `contrastRatio(result, "#ffffff") >= 4.5`.

R27. For each of `#1e88e5`, `#4caf50` and `#f57c00` — the three seeded primitives that measurably
     fail 4.5:1 against white (3.68, 2.78 and 2.70 respectively) — the clamp's result differs from
     the input and its OKLCH hue angle is within 2 degrees of the input's. `#d32f2f` is excluded
     from the "differs" half deliberately: it measures **4.98:1 and already passes**, so R25 requires
     it to come back untouched. Aheed's red not being restyled is the assertion here, and a
     requirement demanding it change would have forced the clamp to damage a compliant colour.

R28. `clampForContrast("#ffffff", ["#ffffff"], 4.5)` returns a value meeting 4.5:1 against white
     rather than looping or returning `#ffffff`.

## Per-vendor theming (`brandStyle`)

R29. `brandStyle(primitives)` returns an object whose keys include `--color-action`, `--color-accent`,
     `--color-danger`, `--color-action-hover`, `--color-accent-hover` and `--color-primary`, in
     addition to the eight `--color-brand-*` primitives, `--color-surface-muted` and the three tints
     it already returned.

R30. For both Aheed's and SriMart's seeded primitives, `brandStyle()`'s `--color-action`,
     `--color-accent` and `--color-danger` each meet 4.5:1 against `#ffffff`, and each hover value has
     strictly lower OKLCH lightness than its base while also meeting 4.5:1.

R31. For both vendors, `brandStyle()`'s `--color-action` differs from that vendor's raw `green`
     primitive (`#4caf50` for Aheed, `#1e88e5` for SriMart).

R32. For both vendors, `brandStyle()`'s `--color-primary` meets 4.5:1 against `#ffffff` and against
     that vendor's `cream`, `green-tint`, `orange-tint` and `red-tint` primitives.

R33. Rendered `/` for SriMart's host carries an inline `style` on the root element declaring
     `--color-action` with a value other than `#1e88e5`; rendered `/` for Aheed's host declares it
     with a value other than `#4caf50`.

## Persistent documentation

R34. `specs/decisions/ADR-004-multi-tenancy.md` decision 5 states that the semantic layer is derived
     per vendor through the contrast clamp, and its front-matter `version` exceeds `1.4.0`.

R35. `specs/design-system.md`'s "do not restore the brand hex into the semantic layer" rule
     distinguishes a raw brand hex (still forbidden) from a value derived through `clampForContrast`,
     and its front-matter `version` exceeds `1.7.1`.

R36. `lib/vendor-theme.ts`'s doc comment states which tokens are re-declared per vendor and that each
     is clamped, and retains its explanation of why an inline style outranks a `:root` rule.

R37. `specs/roadmap.md` contains a change-log row citing `PR #275` for P7.5b's promotion to
     production, and `npm run sdd:audit` reports no promotion pending carry-forward.

## Gates

R38. `CHANGELOG.md` updated (Gate 4).

R39. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
