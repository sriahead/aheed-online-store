# Colourful Noto Emoji icons across storefront and admin surfaces (requirements / acceptance criteria)

Closes issue `#1239`. Extends `specs/decisions/ADR-008-icon-system.md` and `specs/2026-10-22-icon-system/plan.md`.

## Provider types and build-time generator

R1. `components/icons/types.ts` defines `IconProvider = "lucide" | "ph" | "noto"` and keeps `RegistryEntry` as a discriminated union where `tier: "functional"` requires `provider: "lucide"`, while `tier: "decorative" | "status"` accepts `provider: IconProvider`.

R2. `scripts/lib/icon-build.ts` supports `provider: "noto"` in `PROVIDER_SET` (`noto: "noto"`), emits `root: {}` (no `fill="currentColor"` or `stroke="currentColor"` on `<svg>`) for every `provider: "noto"` entry, and does not hoist child `fill` or `stroke` attributes onto the root for `noto` entries.

R3. To prevent inline SVG gradient and clipPath ID collisions when multiple Noto Emoji icons render on the same page, `scripts/lib/icon-build.ts` rewrites every internal `id="<id>"` attribute and every `#<id>` reference (`url(#<id>)`, `href="#<id>"`, `xlink:href="#<id>"`) inside a `provider: "noto"` icon body to `ni-<semanticName>-<id>`, so no raw `id="svgID..."` or `url(#svgID...)` remains in `components/icons/generated/icon-data.ts`.

R4. `buildLicences` in `scripts/lib/icon-build.ts` deduplicates icon sets across both `ICON_REGISTRY` and `DEPARTMENT_ILLUSTRATIONS` so `@iconify-json/noto` (`Apache-2.0`) appears once in `public/third-party-icon-licenses.txt` without throwing a duplicate-licence error.

R5. `npm run icons:build` exits `0`, is idempotent across consecutive runs, and `npm run icons:check` exits `0`.

## Registry coverage and tier boundaries

R6. `ICON_REGISTRY` in `components/icons/registry.ts` contains **110** semantic keys:
    - **31** keys with `provider: "lucide"`: the **30** `tier: "functional"` UI control keys (`arrow-left`, `arrow-right`, `ban`, `bookmark-plus`, `check`, `chevron-down`, `chevron-left`, `chevron-right`, `chevron-up`, `copy`, `download`, `external-link`, `eye`, `eye-off`, `loader-circle`, `log-in`, `log-out`, `minus`, `panel-left-close`, `panel-left-open`, `pause`, `play`, `plus`, `repeat`, `rotate-ccw`, `save`, `search`, `share`, `sliders-horizontal`, `x`) plus **1** `tier: "decorative"` rating `star` key.
    - **79** keys with `provider: "noto"`: **73** `tier: "decorative"` keys (including `featured-star`, `heart-outline`, `rewards-*`, `trust-*`, `circle-question-mark`, `lock`, `pencil`, `trash`) and **6** `tier: "status"` keys (`badge-check`, `circle-alert`, `circle-check`, `circle-x`, `shield-alert`, `triangle-alert`).

R7. Every `provider: "lucide"` entry in `ICON_REGISTRY` continues to satisfy Lucide root attribute hoisting (`fill="none"`, `stroke="currentColor"`, `stroke-linecap`, `stroke-linejoin`, `stroke-width`) and `tests/icon-lucide-parity.test.ts` passes for all 31 Lucide entries.

## Storefront and component surfaces

R8. `components/product/FavouriteButton.tsx` renders `<Icon name="heart-outline" className="h-4 w-4" />` (Noto Emoji `white-heart`) when `displayed === "signed-out"` or `displayed === "off"`, and `<Icon name="heart" className="h-4 w-4" />` (Noto Emoji `red-heart`) when `displayed === "on"`, preserving the 44x44 px touch target, `aria-label`, `aria-pressed`, optimistic toggle, and sign-in redirect behavior.

R9. `components/product/CollectionNav.tsx` renders `icon: "featured-star"` (Noto Emoji `glowing-star`) for the `"Featured Products"` collection link while `components/product/StarRatingInput.tsx` and product review star ratings continue to render `name="star"` (`provider: "lucide"`).

R10. `components/layout/Header.tsx` keeps `<Icon name="search" className="h-4 w-4" />` (`provider: "lucide"`) on the dark search submit button for contrast, while header fulfilment (`truck`, `store`), navigation (`sparkles`, `shopping-bag`, `bookmark`, `list-checks`), top bar (`tag`, `circle-question-mark`, `user`, `user-plus`), and account menu icons render colourful Noto Emoji via `ICON_REGISTRY`.

R11. `components/layout/DepartmentGlyph.tsx` fallback `<Icon>` rendering works cleanly when `categoryIconName(slug)` resolves to a `provider: "noto"` icon (`tag`, `apple`, `beef`, `milk`, `croissant`, `coffee`, `sparkles`).

## Accessibility, security, and bundle integrity

R12. `<Icon>` accessibility contract (`aria-hidden="true"` and `focusable="false"` when `label` is omitted; `role="img"` and `aria-label={label}` when `label` is provided) and CSP safety (no `<script`, `<foreignObject`, `javascript:`, or inline `on*=` handlers in generated SVG bodies) hold across all 110 registry entries.

R13. No file outside `components/icons/` and the test suite imports `lucide-react` directly (`tests/icon-imports.test.ts` passes), and `npm run build` completes cleanly within Worker and client bundle guardrails.

## Documentation and KMS

R14. `specs/decisions/ADR-008-icon-system.md` and `specs/design-system.md` (`## Icons`) are updated to reflect that `provider: "noto"` (`@iconify-json/noto`, Apache-2.0) powers inline `decorative` and `status` icons in `ICON_REGISTRY` as well as static department illustrations, while `functional` icons and rating `star` remain `lucide`.

R15. `specs/roadmap.md` records the promotion row for **PR #1237 (`71fced7`)** and `npm run sdd:audit` exits `0`.

R16. `npm run kms:validate`, `npm run kms:check-generated`, `npm run kms:assemble:internal`, and the internal KMS portal Next.js build (`kms/site-internal`) all exit `0`.
