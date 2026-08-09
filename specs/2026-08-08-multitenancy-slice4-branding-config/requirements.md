# ADR-004 slice 4 — branding-as-CSS-vars + config split (requirements)

Collapse the hardcoded vendor surfaces into DB-driven per-vendor config (issue #73, umbrella #49),
building on slice 3b's host→tenant resolver. The satellite tables (`VendorBranding`/`VendorConfig`/
`VendorDeliveryArea`) exist from slice 1 and ship empty; this slice fills them and wires the read
paths. Storefront-visible core scope; the metadata long tail and per-vendor email From are deferred.

R1. `prisma/seed.ts` upserts `VendorBranding`, `VendorConfig`, and `VendorDeliveryArea` for **Aheed**:
    `VendorBranding` primitives equal the exact current `tokens.css` hex (`brandGreenDark #1b5e20`,
    `brandGreen #4caf50`, `brandOrange #f57c00`, `brandRed #d32f2f`, `brandCream #f5f5f0`,
    `brandGreenTint #e8f5e9`, `brandOrangeTint #fff3e0`, `brandRedTint #ffebee`), `name`
    "Aheed Food Centre", a `tagline`, `logoStorageKey` `vendors/{AHEED_VENDOR_ID}/logo.png`;
    `VendorConfig.localityName` "Milton Keynes" with a `senderName`/`senderEmail`; one
    `VendorDeliveryArea` with `prefix` "MK". Upserts are idempotent (a second `db:seed` adds no rows).

R2. When SriMart is seeded (both `SEED_AHEED_HOST` and `SEED_SRIMART_HOST` set — the existing guard),
    `prisma/seed.ts` also upserts SriMart's `VendorBranding` (colours **visibly distinct** from
    Aheed's — not the same hex), `VendorConfig` (different `localityName`), and at least one
    `VendorDeliveryArea` (different `prefix`), with `logoStorageKey` null.

R3. `lib/repositories/vendor.ts` exposes read functions for the **current** vendor's branding,
    config, and delivery-area prefixes, resolved via `getCurrentVendorId()` + Prisma and memoized per
    request with React `cache()` (never across requests). No file outside `lib/repositories/*`
    imports `@prisma/client` or `@/lib/db` — the slice-2 ESLint guard stays green (`npm run lint`
    exits 0).

R4. `app/(storefront)/layout.tsx` wraps `<Header/>` + children in an element whose inline `style`
    sets all eight `--color-brand-*` custom properties (`green-dark`, `green`, `orange`, `red`,
    `cream`, `green-tint`, `orange-tint`, `red-tint`) from the resolved vendor's `VendorBranding`.
    `design-system/tokens/tokens.css` is unchanged; no component reads a `VendorBranding` field
    directly for colour.

R5. `components/layout/Header.tsx` contains no literal "Aheed Food Centre" or "Milton Keynes": the
    promo bar and delivery strip render `VendorBranding.name` and `VendorConfig.localityName`.

R6. The header logo renders `<img src={`${CDN_BASE_URL}/${logoStorageKey}`}>` when both
    `logoStorageKey` and `CDN_BASE_URL` are set, and otherwise a styled text wordmark from
    `VendorBranding.name`. Aheed's existing `public/images/brand/logo.png` is uploaded to object
    storage at `vendors/{AHEED_VENDOR_ID}/logo.png`; SriMart's `logoStorageKey` is null.

R7. `lib/delivery.ts`'s `isDeliverable(postcode, prefixes)` is pure (imports no Prisma) and returns
    `true` iff the normalized postcode's outward area starts with one of `prefixes` followed by a
    digit: e.g. `isDeliverable("mk9 1aa", ["MK"]) === true`, `isDeliverable("B1 1AA", ["MK"]) ===
    false`, `isDeliverable("", ["MK"]) === false`, `isDeliverable("RG1 1AA", ["MK","RG"]) === true`.

R8. `app/(storefront)/page.tsx` contains no literal "Milton Keynes" or "MK": the postcode checker
    reads the current vendor's `VendorDeliveryArea` prefixes and passes them to `isDeliverable`, and
    its result message uses `VendorConfig.localityName`; the hero headline uses `VendorBranding.tagline`
    and its supporting line uses `localityName`.

R9. `app/layout.tsx` and `app/(storefront)/page.tsx` export `generateMetadata` composing
    title/description from the resolved vendor's `VendorBranding` (name/tagline), falling back to a
    neutral platform default string when no vendor resolves (the root layout also serves
    `/coming-soon`). No hardcoded "Aheed Food Centre — Milton Keynes…" title literal remains in
    either file.

R10. The password-reset and email-verification **subjects** in `lib/auth.ts` are composed from the
     resolved vendor's `VendorConfig.senderName` (falling back to a platform default when unresolved);
     the email From address is unchanged.

R11. Unit tests cover `isDeliverable(postcode, prefixes)` (matching prefix, non-matching prefix,
     lower-case/whitespace normalization, empty input, multi-prefix) and the vendor branding read path
     (returns the seeded values for a given vendor id). `npm test` passes.

R12. On a seeded environment the two hosts render **different branding**: `srimart-staging.nocaped.com`
     shows SriMart's colours/name/wordmark and its delivery locality, while
     `staging.aheedfoodcentre.nocaped.com` shows Aheed's colours/logo and "Milton Keynes".

R13. `specs/design-system.md` records that the primitive layer is **overridable per vendor at runtime**
     (CSS-var injection from `VendorBranding`, `tokens.css` = the default/Aheed primitives);
     `specs/architecture.md`'s tenancy note gains a slice-4 line; `docs/env-setup.md` documents the
     one-time Aheed logo upload (no new env vars). Front-matter versions bumped on edited docs and
     `ARTIFACT_INDEX.md` regenerated.

R14. `CHANGELOG.md` updated (Gate 4), referencing #73.

R15. `lint`, `typecheck`, `test`, `format:check`, and `kms:validate` all remain green after this slice.
