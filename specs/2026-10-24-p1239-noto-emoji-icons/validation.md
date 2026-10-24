# Colourful Noto Emoji icons across storefront and admin surfaces (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

1. **Unit Testing** — Registry invariants, generator SVG ID namespacing, `<Icon>` rendering for both `lucide` and `noto` providers, `FavouriteButton` heart state switching, `CollectionNav` featured star.
2. **Integration Testing** — `icons:build` and `icons:check` CLI round-trip against `@iconify-json/noto`, `@iconify-json/lucide`, and `public/third-party-icon-licenses.txt`.
3. **System / End-to-End Testing** — Full production build (`npm run build`), internal KMS portal build, and live staging verification on both vendor hosts (`staging.aheedfoodcentre.nocaped.com` and `srimart-staging.nocaped.com`).
4. **Regression & Acceptance Testing** — Lucide parity test (`tests/icon-lucide-parity.test.ts`), import ban (`tests/icon-imports.test.ts`), department illustrations (`tests/department-illustrations.test.tsx`).
5. **Performance & Resilience Testing** — Bundle check and zero runtime Iconify network fetches.
6. **Security & Accessibility Testing** — SVG body sanitization (`<script`, `<foreignObject`, `javascript:`, `on*=`) and `aria-hidden` / `role="img"` semantics across all 110 icons.

---

## Validation Matrix

| Req | Testing Area | How to verify |
| --- | --- | --- |
| R1 | Unit Testing | Run `npx vitest run --maxWorkers=4 tests/icon-registry.test.ts` and `npm run typecheck`. Verify `IconProvider` includes `"noto"` and `@ts-expect-error` rejects `{ tier: "functional", provider: "noto", id: "x" }`. |
| R2 | Unit Testing | Run `npx vitest run --maxWorkers=4 tests/icon-generated-data.test.ts tests/icon.test.tsx`. Verify every `provider: "noto"` entry has `root: {}` in `GENERATED_ICONS` and renders `<svg>` without root `fill="currentColor"` or `stroke="currentColor"`. |
| R3 | Unit Testing | Run `npx vitest run --maxWorkers=4 tests/icon-generator.test.ts tests/icon-generated-data.test.ts`. Verify that no `provider: "noto"` entry in `GENERATED_ICONS` contains raw `id="svgID` or `url(#svgID`, that all internal SVG IDs and references (`url(#...)`, `href="#..."`, `xlink:href="#..."`) are prefixed with `ni-<semanticName>-`, and that rendering two Noto icons on the same page produces zero duplicate DOM `[id]` attributes. |
| R4 | Integration Testing | Run `npx vitest run --maxWorkers=4 tests/icon-generator.test.ts` and inspect `public/third-party-icon-licenses.txt`. Verify `@iconify-json/noto` (`Apache-2.0`) and `@iconify-json/lucide` (`ISC`) each appear once and `npm run icons:build` exits `0`. |
| R5 | Integration Testing | Run `npm run icons:build && git status --porcelain && npm run icons:check`. Both commands exit `0` and leave a clean working tree. |
| R6 | Unit Testing | Run `npx vitest run --maxWorkers=4 tests/icon-registry.test.ts tests/icon-lucide-manifest.test.ts`. Verify `ICON_REGISTRY` has 110 keys (30 `functional` on `lucide`, 1 `star` on `lucide`, 73 `decorative` on `noto`, 6 `status` on `noto`). |
| R7 | Regression & Acceptance Testing | Run `npx vitest run --maxWorkers=4 tests/icon-lucide-parity.test.ts tests/icon.test.tsx`. Verify all 31 `provider: "lucide"` icons match `lucide-react` markup and root attribute hoisting. |
| R8 | Unit Testing | Run `npx vitest run --maxWorkers=4 tests/favourite-heart.test.tsx`. Verify `FavouriteButton` renders `svg[data-icon="heart-outline"]` when `signed-out` or `initialIsFavourited={false}`, switches optimistically to `svg[data-icon="heart"]` when clicked while signed in, and reverts on non-2xx response. |
| R9 | Unit Testing | Run `npx vitest run --maxWorkers=4 tests/icon-phase3-surfaces.test.tsx`. Verify `CollectionNav` renders `svg[data-icon="featured-star"]` for `"Featured Products"` while `StarRatingInput` renders `svg[data-icon="star"]`. |
| R10 | Unit Testing | Run `npx vitest run --maxWorkers=4 tests/icon-phase3-surfaces.test.tsx`. Verify header search button uses `svg[data-icon="search"]` (`lucide`) while header, trust strip, and rewards icons render colourful `noto` SVGs. |
| R11 | Regression & Acceptance Testing | Run `npx vitest run --maxWorkers=4 tests/department-illustrations.test.tsx`. Verify `DepartmentGlyph` fallback `<Icon>` renders cleanly for unknown slugs (`data-icon="tag"`). |
| R12 | Security & Accessibility Testing | Run `npx vitest run --maxWorkers=4 tests/icon.test.tsx tests/icon-generator.test.ts tests/icon-generated-data.test.ts`. Verify `aria-hidden="true"` / `role="img"` semantics and absence of unsafe SVG elements/attributes across all 110 generated icons. |
| R13 | Performance & Resilience Testing | Run `npx vitest run --maxWorkers=4 tests/icon-imports.test.ts` and `npm run build`. Verify zero direct `lucide-react` imports in app/components and clean Next.js + OpenNext build. |
| R14 | Regression & Acceptance Testing | Inspect `specs/decisions/ADR-008-icon-system.md` and `specs/design-system.md` (`## Icons`) and run `npx vitest run --maxWorkers=4 tests/icon-tone-contrast.test.ts`. |
| R15 | Integration Testing | Run `npm run sdd:audit`. Verify it exits `0` with no unrecorded promotions or closed staging-only issues. |
| R16 | System / End-to-End Testing | Run `npm run kms:build-index && npm run kms:validate && npm run kms:check-generated && npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)`. Verify all exit `0`. |
