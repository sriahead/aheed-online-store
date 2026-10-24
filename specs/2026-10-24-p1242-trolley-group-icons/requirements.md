# Trolley icon for checkout and group icon for contact cluster (requirements)

Issue `#1242`.

## Functional Requirements

- **R1:** `ICON_REGISTRY` in `components/icons/registry.ts` includes `"shopping-cart": { tier: "decorative", provider: "noto", id: "shopping-cart" }`.
- **R2:** `npm run icons:build` resolves `@iconify-json/noto` icon `shopping-cart` (🛒) into `components/icons/generated/icon-data.ts`, with internal gradient and clipPath IDs namespaced with `ni-shopping-cart-` prefix.
- **R3:** `components/cart/CartDrawerShell.tsx` renders `<Icon name="shopping-cart" className="h-5 w-5" />` in the floating cart opener button (when empty and with item counts) and in the drawer header beside "Your Order".
- **R4:** `components/cart/CartContents.tsx` renders `<Icon name="shopping-cart" className="mb-3 h-16 w-16 text-primary-subtle" />` in the empty basket state.
- **R5:** `components/layout/FloatingContact.tsx` renders `<Icon name="users" className="h-5 w-5" />` on the collapsed floating contact cluster launcher button instead of `share`.
- **R6:** When the floating contact cluster is open, `FloatingContact.tsx` continues to render `<Icon name="x" className="h-5 w-5" />`.
- **R7:** `public/third-party-icon-licenses.txt` remains valid and deduplicated.
- **R8:** Bundle size overhead is within budget; all unit tests pass with `npx vitest run --maxWorkers=4`.
