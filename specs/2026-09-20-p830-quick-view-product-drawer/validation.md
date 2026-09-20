# P830 — Quick View Product Drawer (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests.
> - **Build:** Verify the drawer component, API route, context provider, and updated card triggers.
> - **Validate:** Verify interactive quick view opening, focus trapping, cart actions, reviews lifecycle, and accessibility.
> - **Release:** Confirm absence of drill-down link, no nested button markup, and clean quality gates.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit         | Run `npx vitest run tests/product-card-stretched-link.test.tsx` asserting presence of desktop Quick View hover overlay with `group-hover:opacity-100` and transition classes. |
| R2  | Unit         | Run `npx vitest run tests/product-card-stretched-link.test.tsx` asserting presence of mobile compact Quick View button with `sm:hidden`. |
| R3  | Unit         | Run `npx vitest run tests/product-card-stretched-link.test.tsx` verifying no stretched `<a>` link targeting `/products/` and no nested button hierarchy. |
| R4  | Unit         | Run `npx vitest run tests/quick-view.test.tsx` verifying dialog role, backdrop dismiss, Escape key dismiss, and accessible close button. |
| R5  | Unit         | Run `npx vitest run tests/quick-view.test.tsx` verifying rendered product name, price, rating stars, review count, stock info, and thumbnail switching. |
| R6  | Unit         | Run `npx vitest run tests/quick-view.test.tsx` verifying drawer variant Add to Cart button and quantity stepper functionality. |
| R7  | Unit         | Run `npx vitest run tests/quick-view.test.tsx` asserting review list rendering, verified badges, review submission, update, and delete actions. |
| R8  | Inspection   | Run `npx vitest run tests/quick-view.test.tsx` verifying absence of any "View full details" link. |
| R9  | Route        | Run `npx vitest run tests/quick-view-route.test.ts` asserting 400 for missing slug, 404 for invalid slug, and 200 with product and review payloads for valid slug. |
| R10 | Process      | Verify `git diff CHANGELOG.md` contains an entry for `#830` under Post-launch improvements / Storefront. |
| R11 | Gate 3       | Run `npm run lint && npm run typecheck && npm run format:check && npx vitest run` and verify all commands exit 0 with zero errors. |
