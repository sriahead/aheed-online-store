# Help Centre exact facts + per-vendor approved-answer corpus (requirements / acceptance criteria)

Closes `#1013` and `#1012` — slice 1 of the chatbot programme (`#1015`). `#1013` replaces the Help
Centre's platform-written delivery and loyalty claims with values computed from `VendorConfig` and
`VendorDeliveryArea`; `#1012` adds the per-vendor approved-answer model, its staff editor and its
storefront rendering. The narrative, the live-production evidence for the loyalty defect and the
full excluded list are in `plan.md`. Terms used below: **"the help page"** is
`app/(storefront)/help/page.tsx`; **"the profile"** is the `VendorProfile` returned by
`getCurrentVendorProfile()` (`lib/vendor-service.ts`); **"loyalty config"** is the `LoyaltyConfig`
returned by `getLoyaltyRepository().config()` (`lib/loyalty-service.ts`).

## `#1013` — the Help Centre computes its facts

R1. The help page renders no loyalty heading, earning sentence, redemption sentence or points
    wording of any kind when loyalty config's `loyaltyEnabled` is `false`. This covers the **whole
    served page**, including the `docs/shopper-help/shopping-guide.md` content the page renders
    through `DocumentSectionRenderer` — so R10 is a prerequisite, not an independent tidy-up.
    Verified against a vendor whose `VendorConfig.loyaltyEnabled` is `false`, not only by reading
    the branch.

R2. When `loyaltyEnabled` is `true`, the help page states that vendor's own `pointsPerPoundEarned`,
    `pencePerPointRedeemed` and `minRedeemPoints` as rendered numbers. No points rate, redemption
    rate or threshold appears as a literal in the page source.

R3. The help page states "no minimum" (or equivalent wording carrying that meaning) when the
    applicable `minimumOrderPence` is `0`, and the exact amount formatted by `formatPrice`
    (`components/product/format-price`) when it is greater than `0`. The string
    "minimum order value is required" no longer appears in the file.

R4. The help page derives every delivery fee, minimum-order and free-delivery figure through
    `resolveDeliveryRules` (`lib/delivery-pricing.ts`). The page contains no direct read of
    `profile.deliveryFeePence`, `profile.minimumOrderPence` or `profile.freeDeliveryThresholdPence`
    other than as arguments passed into that function.

R5. When no `VendorDeliveryArea` row for the vendor overrides a given money field, the help page
    presents that field as one figure. When at least one row overrides it, the page additionally
    renders the per-area figures, keyed by `prefix`, so no single figure is presented as applying
    everywhere. Verified with a vendor carrying at least one overriding area row.

R6. A `null` `freeDeliveryThresholdPence` renders as free delivery **not being offered**, never as
    free delivery on every order and never as a `£0.00` threshold (`#892`'s semantics).

R7. The help page renders collection content only when the profile's `offerCollection` is `true`,
    and renders no collection content when it is `false`.

R8. The help page lists the vendor's delivery areas from the profile's `deliveryPrefixes`, and
    renders no area list element at all when that array is empty (`#239`'s null-hides rule).

R9. A test under `tests/` fails if the help page regains an ungated loyalty claim — it asserts that
    rendering the page for a `loyaltyEnabled: false` vendor produces none of the loyalty wording
    from R1, and it fails when the gate is removed.

R10. Any sentence in `docs/shopper-help/shopping-guide.md` that the changes above make
     self-contradictory is removed or amended so the guide and the page do not disagree. This
     specifically includes the hedged minimum-order, delivery-fee and free-delivery claims, and the
     "Loyalty Program (If Enabled)" block — that block must not reach a `loyaltyEnabled: false`
     vendor's page at all, since the page renders this document's content verbatim (see R1). No
     other part of that document is rewritten.

## `#1012` — the per-vendor approved-answer corpus

R11. `prisma/schema.prisma` declares a `VendorFaq` model with: `id`, `vendorId` with a
     `Vendor` relation `onDelete: Cascade`, `question`, `answer`, `sortOrder` defaulting to `0`,
     `isActive` defaulting to `true`, `createdAt`, `updatedAt`, plus
     `@@unique([vendorId, question])` and `@@index([vendorId, isActive, sortOrder])`. No `Json`
     column.

R12. The migration is generated with `--create-only`, its SQL is committed, and that SQL contains
     no `DROP INDEX` against any `pg_trgm` index (`CLAUDE.md`'s standing Prisma trap since `#508`).

R13. `lib/repositories/vendor-faqs.ts` exists, imports `@/lib/db` as a type-only import, and every
     export takes its Prisma client and `vendorId` as explicit parameters while reading no request
     context. `npx vitest run tests/repository-purity.test.ts
     tests/repository-client-injection.test.ts` exits 0.

R14. No write in `lib/repositories/vendor-faqs.ts` opens an implicit transaction on the HTTP
     adapter: no `createMany`, no `updateMany`, and no singular `create` carrying nested child
     writes. Writes are singular `create`/`update` keyed by `id` and `deleteMany`.

R15. Every write and delete is vendor-scoped in its `where` clause, so an `id` belonging to another
     vendor updates and deletes zero rows rather than throwing or succeeding. Proved against a real
     database with two vendors.

R16. `lib/vendor-faqs-service.ts` provides the request-scoped facade that resolves the current
     vendor, and the staff and storefront call sites use it rather than the repository directly.

R17. `features/admin/faqs.ts` carries the `"use server"` directive and exports **only** async
     functions. The form-state type and every parser live in `lib/faq-form.ts`
     (`CLAUDE.md`: a `"use server"` file exporting a plain constant 500s every action in it at
     runtime while `build`, `typecheck` and `test` stay green).

R18. `app/(admin)/staff/faqs/page.tsx` gates on `requireVendorRole("ADMIN")` and renders the
     `PanelRefusal` component on the refusal branch, never `return null`.
     `npx vitest run tests/panel-refusal-coverage.test.ts` exits 0.

R19. The new page is reachable from all three required surfaces — `components/staff/PanelNav.tsx`,
     the hub at `app/(admin)/staff/page.tsx`, and `docs/store-admin-guide/admin-tabs-guide.md`
     (the guide matching an ADMIN-only gate). `npx vitest run tests/staff-nav-parity.test.ts
     tests/operator-doc-coverage.test.ts` exits 0.

R20. The staff editor creates, edits, reorders, deactivates and deletes rows, and a second vendor's
     rows are never listed, edited or deleted from the first vendor's session. Proved under
     `npm run preview` against a real database, not `npm run dev`.

R21. The help page renders the vendor's `isActive` rows in `sortOrder` order, and renders no FAQ
     section element at all when the vendor has zero active rows. No answer text, question text or
     placeholder answer is seeded, hardcoded or used as a default value anywhere in the repository.

R22. No new user-facing string names a vendor or assumes a product category, and no new component
     prop carrying vendor copy has a default value. `npx vitest run tests/vendor-neutral-copy.test.ts`
     exits 0.

## Gates

R23. `docs/` and `specs/` changes rebuild clean: `npm run kms:validate`, `npm run kms:build-index`
     and `npm run kms:check-generated` exit 0, `npm run kms:assemble:internal` succeeds, and a real
     Next build in `kms/site-internal` succeeds (`gates` never builds the docs site).

R24. `CHANGELOG.md` updated on the branch (Gate 4).

R25. `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone), `npm run format:check` and
     `npm run build` all exit 0 after this slice (Gate 3).
