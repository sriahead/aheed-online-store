# Shopper copy that contradicts the system (requirements / acceptance criteria)

Closes `#1045` (the points-expiry sentence on `/help` and in the help assistant describes per-point
aging, while `lib/loyalty.ts:71` `isLapsed()` lapses the whole balance on **inactivity**) and
`#1043` (the guest order-lookup placeholder hardcodes `AHE-`, one vendor's derived order-number
prefix, on every vendor's store). Builds on `lib/help-facts.ts`, already imported by both affected
shopper surfaces, and on `lib/order-totals.ts:158` `vendorOrderPrefix()`. The staff label in
`components/staff/LoyaltyConfigForm.tsx` is included by explicit approval although `#1045` names
only shopper surfaces. Copy only: no schema change, no migration, no behaviour change, no
dependency change. See `plan.md` for the reasoning and the excluded surfaces.

**The two exact strings this slice introduces.** Every requirement below refers to these; they are
written out once here so a validator with no memory of the slice can compare literally.

- **SHOPPER_SENTENCE** (`{N}` is the configured month count, interpolated):
  `Points expire if your account goes {N} months without an order. Placing an order resets the clock.`
- **STAFF_LABEL**:
  `Points expire after this many months without an order (blank = never)`

R1. `lib/help-facts.ts` exports a function `pointsExpirySentence(months: number): string` whose
    return value for `months = 12` is exactly SHOPPER_SENTENCE with `{N}` replaced by `12`.

R2. `app/(storefront)/help/page.tsx` renders the loyalty section's expiry line from
    `pointsExpirySentence(...)` rather than an inline literal, and still renders that line only
    when `loyalty.pointsExpiryMonths !== null`.

R3. `lib/assistant-content.ts` `rewardsEntry()` pushes exactly `pointsExpirySentence(...)` into the
    REWARDS answer when `pointsExpiryMonths` is non-null, and pushes no expiry sentence at all when
    it is `null`.

R4. No file under `app/`, `components/` or `lib/` with a `.ts` or `.tsx` extension contains the
    substring `months after you earn` (the generated `app/(admin)/staff/runbook/docs.ts` is
    excluded: it embeds prose from `docs/`, is rebuilt by `kms:build-index`, and is not a copy
    surface).

R5. The months input in `components/staff/LoyaltyConfigForm.tsx` has the accessible label
    STAFF_LABEL, and the input's `id` and the label's `htmlFor` remain `pointsExpiryMonths`.

R6. `app/(storefront)/orders/lookup/page.tsx` sets the order-number field's `placeholder` to
    `e.g. {PREFIX}-20260813-K4M2XQ`, where `{PREFIX}` is `vendorOrderPrefix(profile.slug)` for the
    vendor resolved from the current request, and that file contains no `AHE-` literal.

R7. `app/(storefront)/orders/lookup/page.tsx` obtains the vendor slug from
    `getCurrentVendorProfile()` (`lib/vendor-service.ts`) and adds no import from
    `lib/repositories/`, so the placeholder introduces no additional database query on a page the
    `(storefront)` layout has already resolved the profile for.

R8. `tests/vendor-neutral-copy.test.ts`'s `FORBIDDEN` array contains the entry `"AHE-"`, and
    `npx vitest run tests/vendor-neutral-copy.test.ts` exits 0.

R9. Served under `npm run preview`, `/orders/lookup` renders a placeholder containing `AHE-` on the
    Aheed host and `SRI-` on the SriMart host (`srimart.localhost:8787`), confirming the value is
    derived per vendor rather than constant.

R10. `tests/help-vendor-facts.test.tsx` and `tests/assistant-content.test.ts` each assert
     SHOPPER_SENTENCE literally, so restoring either surface's previous wording fails them. Neither
     file retains an assertion that passes against the old `expire {N} months after you earn them`
     phrasing.

R10a. The two durable conventions this slice established are recorded in persistent docs, and the
     KMS artefacts are regenerated for them: `docs/developer-portal/app-conventions.md` states that
     a derived value is never hardcoded as an example (`#1043`), that copy stating a system rule
     comes from one shared helper (`#1045`), and that copy is asserted by string equality rather
     than a pattern; `docs/developer-portal/local-dev-playbook.md` records that `kms:coverage`
     counts gitignored files. `kms:validate` reports `invalid front-matter (failing): 0`,
     `kms:check-generated` reports both artefacts current, and a real `next build` in
     `kms/site-internal` succeeds — `gates` never builds the docs site.

     *(Added after approval: the Build-notes stage requires a standing decision to be recorded in
     its persistent doc on the same branch, which put `docs/` in scope. The requirement describes
     work the stage mandates, not new scope chosen here.)*

R11. `CHANGELOG.md` updated (Gate 4).

R12. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice. Because `#1125`
     makes a full `vitest` run able to lose whole test files while still printing a pass line, the
     run's **file count** is recorded and must equal the count of test files present in the repo —
     a lower count is a failed run, not a pass.
