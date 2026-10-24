# Trolley icon for checkout and group icon for contact cluster (validation)

Issue `#1242`.

## Automated Checks

| Requirement | Test / Check | Command | Pass Criteria |
|---|---|---|---|
| R1, R2 | `tests/icon-registry.test.ts`, `tests/icon.test.tsx` | `npx vitest run tests/icon-registry.test.ts tests/icon.test.tsx` | `shopping-cart` is registered and renders Noto Emoji inline SVG |
| R3, R4 | Render `CartDrawerShell` and `CartContents` | `npx vitest run tests/cart` | Floating button and drawer render `data-icon="shopping-cart"` |
| R5, R6 | Render `FloatingContact` | `npx vitest run tests/floating-contact` or storefront tests | Collapsed button renders `data-icon="users"`, expanded renders `data-icon="x"` |
| R7 | `icons:check` | `npm run icons:check` | All 18 generated/verified files current |
| R8 | Suite verification | `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run --maxWorkers=4` | Zero errors across all checks |
