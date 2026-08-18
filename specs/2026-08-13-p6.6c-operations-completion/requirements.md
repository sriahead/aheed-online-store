# P6.6c — Operations Views Completion (requirements)

Aligns the Staff/Admin operations portal with the `docs/ui-ref` mockup: navigation alignment, an
overview portal, the internal runbook page and the admin reports page.

> **Rewritten 2026-08-18 under #231** (`specs/2026-08-18-validation-debt-bucket/`). The original
> file stated its criteria as unnumbered checkbox bullets and its `validation.md` as a checklist, so
> neither used the repo's Gate-2 format and there was no numbering to map one onto the other. P6.6c
> shipped by direct push during the ungated period after PR #182 and had never been checked against
> its own criteria.
>
> Every obligation below traces to one of the original four sections; none has been dropped.
> **The navigation requirements state a required *subset* rather than a total count** — the original
> asserted "all 9 tabs", which P6.7 falsified when it added `Team`, even though nothing about P6.6c
> had regressed. A gate that breaks when a later slice legitimately adds a feature is a gate that
> gets ignored.

## Navigation alignment (original §1)

R1. `components/staff/PanelNav.tsx` renders, for the **admin** tier, at least: Overview, Live
    Inventory, Orders, Catalogue, Categories, Loyalty, Discounts, Reports and Runbook. Additional
    tabs added by later slices do not violate this requirement.

R2. It renders, for the **staff** tier, at least: Overview, Live Inventory, Orders and Runbook.

R3. It renders, for the staff tier, **none** of: Catalogue, Categories, Loyalty, Discounts or
    Reports.

R4. Both tiers are given an Overview entry pointing at `/staff`, so a staff user is never left
    without a route back to the portal root.

R5. The navigation remains on a single row at a 375px viewport, scrolling horizontally rather than
    wrapping or forcing the page into horizontal overflow.

## Overview portal (original §2)

R6. `app/(admin)/staff/page.tsx` renders a Live Inventory card and an Internal Operational Runbook
    card for both the STAFF and ADMIN tiers.

R7. It renders a Reports card for the ADMIN tier only; a STAFF user does not see it.

## Runbook page (original §3)

R8. `app/(admin)/staff/runbook/page.tsx` exists and renders the internal operational documentation
    as discrete articles.

R9. It admits STAFF and ADMIN via `requireVendorRole("STAFF", "ADMIN")`, and refuses anyone else.

R10. It renders in the dark treatment the mockup specifies (a dark slate surface with accent
     highlights), distinguishing it from the light panel surfaces around it.

## Reports page (original §4)

R11. `app/(admin)/staff/reports/page.tsx` exists and admits ADMIN only, via
     `requireVendorRole("ADMIN")`.

R12. It aggregates the order count and the sum of `totalPence` for the **active vendor only**,
     obtained through `lib/repositories/*` — a direct Prisma import from `app/` is blocked by
     `eslint.config.mjs`'s `no-restricted-imports` rule (ADR-004 slice 2).

R13. It renders exactly three metric cards: Total Revenue, Total Orders and Average Basket Value.

R14. Those figures reflect the vendor's real order data — placing an order for the vendor and
     reloading changes them accordingly.

## Portal integrity

R15. Every navigation link visible to a given role resolves successfully for that role — no 404 and
     no unhandled error.

## Gates

> Repo-standard gates, applied to every slice by `CLAUDE.md`. Recorded here because the original
> file omitted them, not because P6.6c's scope has been widened.

R16. `CHANGELOG.md` updated (Gate 4).

R17. `lint`, `typecheck`, `test` and `format:check` all exit 0.
