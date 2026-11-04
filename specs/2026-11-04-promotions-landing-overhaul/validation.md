# Promotion Intelligence Platform & Storefront Experience (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
> 
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration  | `npx prisma validate` exits 0 with `Promotion` model and `AudienceSegment` enum present in `prisma/schema.prisma`. |
| R2  | Integration  | `prisma/migrations/20261104120000_promotions_overhaul/migration.sql` exists and contains valid DDL; migration check exits 0. |
| R3  | Unit         | `npx vitest run tests/repository-purity.test.ts` exits 0; unit tests in `tests/promotions-repository.test.ts` verify vendor isolation on all queries. |
| R4  | Unit         | `lib/promotions-service.ts` correctly wraps repository calls passing current vendor context. |
| R5  | Unit         | Unit tests in `tests/promotion-liveness.test.ts` pass for active/inactive states and boundary start/end date windows. |
| R6  | Unit         | Server action tests in `tests/promotions-actions.test.ts` verify RBAC gating, Zod validation, and tenant scoping. |
| R7  | System       | Visit `/staff/promotions` with staff credentials; page renders promotion table with status, target badges, and priority. |
| R8  | System       | Visit `/staff/promotions/new`; form renders with headline, subtitle, badge text, CTA text, target selection, priority rank, active toggle, and datetime inputs. |
| R9  | System       | In `/staff/promotions/new`, changing target to Department, Bundle, or Discount Code populates dropdown with that vendor's items only. |
| R10 | Unit/System  | Saving with "Store-wide / Generic" persists `categoryId: null`, `bundleId: null`, and `discountCodeId: null`. |
| R11 | System       | With 1+ live promotions, storefront `/` renders `<PromotionHero>` carousel with title, subtitle, and link. |
| R12 | System       | With 0 live promotions, storefront `/` renders the hero in single-column layout with no promo well, no department glyphs, and no spotlight price box. |
| R13 | System       | Storefront `/` renders the "Shop by department" scroller beneath the hero in both empty and non-empty promotion states. |
| R14 | Regression   | `npx vitest run tests/bundle-pricing.test.ts` and checkout tests pass without regression. |
| R17 | Unit/UX      | Unit test in `tests/promotions-repository.test.ts` verifies sorting by `priority DESC`; component test confirms carousel displays at most 3 slides. |
| R18 | UI/A11y      | Card renders `badgeText` tag when set; contrast ratio of text and badges against slide background satisfies WCAG 2.2 AA. |
| R19 | Integration  | Bundle promotion displays real dynamic price sum; discount-code promotion displays code string and minimum spend requirement. |
| R20 | System       | Clicking promotion CTA navigates to the assigned department slug, bundle anchor, or custom `linkUrl`. |
| R21 | UI           | End dates render formatted strings (e.g. "Ends Sunday"); verify no deceptive countdown timer scripts exist. |
| R22 | Unit         | Action returns validation error if headline length < 3 or > 100, or if `startsAt` is after `endsAt`. |
| R23 | Unit (V2)    | `promotions-service.ts` omits promotions where `audienceSegment` does not match the active customer session. |
| R24 | Integration (V2) | Server endpoint increments aggregate impression and click counters without storing PII or setting tracking cookies. |
| R25 | System (V2)  | `/staff/promotions` renders aggregate impression, click, and CTR metrics for each promotion. |
| R26 | Integration (V3) | `PromotionVariant` rows can be created and queried for a parent promotion. |
| R27 | Unit (V3)    | Deterministic hash test confirms consistent variant assignment per visitor token across 1,000 runs. |
| R28 | System (V3)  | `/staff/promotions` renders comparative variant conversion rate metrics with confidence indicator. |
| R29 | Process      | `CHANGELOG.md` contains entry under `Unreleased` referencing `#1412`. |
| R30 | Catch-all    | `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npx vitest run --maxWorkers=4` exit 0. |
