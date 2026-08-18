# Phase 6.6 — P0 Core Shopping UI Overhaul (requirements)

This phase addresses the most critical UI/UX gaps against the high-fidelity AI Studio prototype
(`docs/ui-ref`), improving merchandising and user navigation while respecting multi-tenancy.

> **Rewritten 2026-08-18 under #231** (`specs/2026-08-18-validation-debt-bucket/`). The original
> eight requirements were correct in intent but stated at a granularity that could not be checked —
> and the matching `validation.md` asked a reader to confirm the UI "matches the prototype", which
> two readers can answer oppositely with neither shown wrong. P6.6 shipped by direct push during
> the ungated period after PR #182, so its criteria had never been compared to the artifact at all.
>
> Every obligation below traces to one of the original R1–R8; **none has been dropped, and none has
> been edited to match what the code was later found to do.** Where the artifact does not satisfy a
> requirement (R6), the requirement stands and the gap is recorded against an open issue.

## Header (original R1)

R1. The storefront header renders the active vendor's logo from `VendorConfig.logoStorageKey`
    composed against `CDN_BASE_URL`, or — when no logo key is set — a deterministic fallback derived
    from the vendor's own name rather than a hardcoded image.

R2. The header renders a location/delivery indicator naming the active vendor's `localityName`.

R3. The header renders a product search input that submits to `/search` as a `GET` with the query in
    the `q` parameter, and is reachable at both mobile and desktop widths.

R4. The header renders a link to `/account` for a signed-in user and a link to `/login` for an
    anonymous visitor.

R5. The header renders a cart trigger displaying the current cart's item count.

R6. The header renders a wishlist link. **Deferred — not satisfied by the artifact.** No wishlist
    exists anywhere in `app/`, `components/`, `features/` or `lib/`; the obligation is tracked at
    **#232** and is deliberately retained here rather than rewritten away. This requirement is
    expected to fail until #232 ships.

## Hero (original R2)

R7. The storefront homepage renders a hero section displaying the active vendor's `tagline`, falling
    back to a literal only when the vendor has none.

R8. The hero renders at least one primary call-to-action control that submits or navigates — the
    postcode deliverability form satisfies this.

## Product discovery (original R3)

R9. The homepage renders at least two distinct product merchandising rows, and each renders at least
    one product card. A row that renders zero cards fails this requirement — the row's *presence* is
    not sufficient, per the defect #211 found and fixed where both rows were silently empty.

## Product cards (original R4)

R10. A rendered product card presents, in this order: image, product name, unit/pack label, price, a
     discount indicator, a quantity selector, and an add-to-cart control. The discount indicator
     renders when and only when the product carries a higher original price.

## Category navigation (original R5)

R11. Top-level category navigation on the homepage renders each category as a visual card or icon
     element, not as a bare text link.

## Multi-tenancy (original R6)

R12. Every vendor-variable value rendered by the surfaces above is derived from the active vendor's
     `VendorConfig` (or a value seeded per vendor), not hardcoded in the component. No component
     under `app/`, `components/`, `features/` or `lib/` references an absolute external asset URL.

## Gates (original R7, R8)

R13. `CHANGELOG.md` updated (Gate 4).

R14. `lint`, `typecheck`, `test` and `format:check` all exit 0.
