# Colourful Noto Emoji icons across storefront and admin surfaces (build notes)

Written at the end of Build, before the Clear. This slice completes the build scope of issue `#1239`.

## What changed and why

1. **`components/icons/types.ts`:**
   - Widened `IconProvider` to `"lucide" | "ph" | "noto"`.
   - Preserved `RegistryEntry` discriminated union so `tier: "functional"` strictly enforces `provider: "lucide"` at compile time.

2. **`scripts/lib/icon-build.ts`:**
   - Added `noto: "noto"` to `PROVIDER_SET`.
   - Set `NOTO_ROOT = {}` so no root `fill` or `stroke` is hoisted onto `<svg>` for Noto Emoji, preserving each child path's multi-colour styling.
   - Implemented `namespaceNotoSvgIds(body, name)` to rewrite internal SVG IDs (`id="<id>"` -> `id="ni-<name>-<id>"`) and references (`url(#...)`, `href="#..."`, `xlink:href="#..."`), eliminating DOM ID collisions when multiple inline Noto Emoji SVGs render on the same page.
   - Updated `buildLicences` to deduplicate `sets` after adding `ILLUSTRATION_SET`, producing exactly one Apache-2.0 notice section for `@iconify-json/noto` without duplicate-licence errors.

3. **`components/icons/registry.ts`:**
   - Switched all 79 `decorative` and `status` icons to `provider: "noto"`, including `trust-*`, `rewards-*`, `circle-question-mark`, `lock`, `pencil`, and `trash`.
   - Added `featured-star` (`glowing-star`) and `heart-outline` (`white-heart`).
   - Kept 30 `functional` UI chrome primitives and 1 interactive rating `star` on `provider: "lucide"`. Total registry count: 110 keys.

4. **`components/product/FavouriteButton.tsx`:**
   - Renders `<Icon name="heart-outline" className="h-4 w-4" />` when unfavourited (`displayed === "off"` or `displayed === "signed-out"`).
   - Renders `<Icon name="heart" className="h-4 w-4" />` when favourited (`displayed === "on"`).

5. **`components/product/CollectionNav.tsx`:**
   - Updated `"Featured Products"` to use `icon: "featured-star"` (Noto Emoji `glowing-star`), ensuring `star` remains purely for 1-5 rating stars.

6. **Tests & Artifacts:**
   - Regenerated `components/icons/generated/icon-data.ts` and `public/third-party-icon-licenses.txt` via `npm run icons:build`.
   - Updated `tests/icon-registry.test.ts`, `tests/icon.test.tsx`, `tests/icon-lucide-manifest.test.ts`, `tests/icon-phase3-surfaces.test.tsx`, `tests/favourite-heart.test.tsx`, `tests/icon-generator.test.ts`, `tests/icon-generated-data.test.ts`, and `tests/department-illustrations.test.tsx`.

## Decisions taken during the build

1. **Internal SVG ID Prefix (`ni-<semanticName>-<id>`):**
   Selected `ni-` ("Noto Icon") followed by the semantic registry key (e.g. `ni-sparkles-svgIDa`). This guarantees uniqueness across icons while maintaining deterministic output for `icons:check`.

2. **Reclassification of `lock`, `pencil`, `trash`, `circle-question-mark` to `decorative`:**
   Per the owner's explicit Gate 1 decision, buttons (edit, delete, checkout lock) and header help icons use colourful Noto Emoji. Since `tier: "functional"` requires `provider: "lucide"`, these were reclassified to `tier: "decorative", provider: "noto"` so only true compact chrome (chevrons, arrows, close, plus/minus, check, spinner) remains on Lucide.

## Deviations from the spec

None.

## Known-shaky areas

- Inline SVG gradient references (`url(#...)`) across multiple tabs or shadow DOM: standard browsers scope `url(#id)` within the local document tree, so per-icon ID namespacing prevents all document-level conflicts.
