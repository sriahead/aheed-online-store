# Validation — Icon credits page, generated icon attribution, and cart tooltip cleanup (#1257)

## Automated Tests

1. `tests/icon-credits-and-tooltips.test.tsx`:
   - R1: `CartDrawerShell` button title is `"My Cart"`, and inner SVG contains no `<title>` or `<desc>` tag that could override the button tooltip.
   - R2: `FloatingContact` button title is `"Contact & Follow Hub"`, and inner SVG contains no conflicting `<title>`.
   - R3: `/icon-credits` page renders all four icon library attributions (Lucide, Google Noto Emoji, Phosphor Icons, Simple Icons) with links to their licences.
   - R4: `/icon-credits` page renders Generated Icons section stating `"Powered by [Platform Name]"` using configurable `PLATFORM_NAME`.
   - R5: `StorefrontFooter` renders "Icon credits" link pointing to `/icon-credits`.

2. Existing Test Suites:
   - `tests/storefront-footer.test.tsx`: Passes with updated `/icon-credits` destination.
   - `tests/ui-checkout-improvements.test.tsx`: All cart and checkout tests pass.
   - `npm run icons:check`: Exits 0, confirming icon generator and licences are clean and current.
   - `npm run sdd:preclear`: Passes all SDD preclear criteria.
