# Colourful, vendor-themed, provider-agnostic icon system (requirements / acceptance criteria)

Closes the build scope of issue `#1223` (Phases 1 to 4a). Builds on `specs/decisions/ADR-008-icon-system.md`
(the decision), `specs/design-system.md` and `specs/decisions/ADR-004-multi-tenancy.md`. In one line: one
`Icon` component over a semantic-name registry and build-time bundled Iconify data, Lucide for
functional icons, Phosphor duotone for decorative ones, Noto Emoji department illustrations as static
files, all coloured from the tokens `brandStyle()` already emits. `plan.md` carries the reasoning.

Each requirement is tagged with the pull request that must satisfy it: **P1** foundation, **P2a**
storefront migration, **P2b** admin migration and import ban, **P3** colour, **P4a** illustrations,
**all** every PR. A later PR must keep every earlier requirement true. Definitions used below:

- **BASE** is the parent of the commit that first added this file:
  `git log --diff-filter=A --format=%H -1 -- specs/2026-10-22-icon-system/requirements.md` then `^`.
- **Semantic name** is a key of `ICON_REGISTRY` in `components/icons/registry.ts`.
- **Decorative** means registry tier `decorative`; **functional** and **status** likewise.
- "Both vendors" means the Aheed host and the SriMart host served by `npm run preview`
  (`srimart.localhost:8787`, per `docs/developer-portal/local-dev-playbook.md`).

## Decisions and documents

R1. [P1] `specs/decisions/ADR-008-icon-system.md` exists, `npm run kms:validate` exits 0 with
    `invalid front-matter (failing): 0`, and the ADR states each of: icon data is bundled at build time
    with no runtime request to Iconify and why (the CSP), icons are addressed by semantic name through a
    registry, the three tiers and the illustration mechanism, that the functional tier is Lucide only,
    and the SPDX licence of each of the three sets (ISC, MIT, Apache-2.0).
R2. [P1] The `## Icons` section of `specs/design-system.md` (from that heading to the next `## `
    heading) names `components/icons`, contains the tier table, the six size tokens with their pixel
    values (12, 16, 20, 24, 32, 48), and the tone table of `plan.md`; and it contains neither the phrase
    `no wrapper component` nor the words `directly from` followed by `lucide-react`.
R3. [P1] `specs/tech-stack.md` lists `@iconify/utils`, `@iconify-json/lucide`, `@iconify-json/ph` and
    `@iconify-json/noto` each with its exact version and SPDX licence, says they are `devDependencies`,
    and says Creative Commons Attribution sets are excluded unless the owner approves.
R4. [P1] `CLAUDE.md` contains, under the heading `Design tokens & per-vendor branding`, one bullet saying
    icons are used only through `components/icons` and pointing at `ADR-008`.

## Dependencies

R5. [P1] `package.json` lists the four packages of R3 under `devDependencies` and not under
    `dependencies`, each version matching `^\d+\.\d+\.\d+$` (no range operator); `tests/dependency-pins.test.ts`
    asserts those four literals and passes.
R6. [P1] `package.json` contains none of `@iconify/react`, `@iconify/tailwind4`, `unplugin-icons`.

## Generator and generated artefacts

R7. [P1] `package.json` defines `icons:build` and `icons:check`. `npm run icons:build` exits 0, and a
    second consecutive run leaves `git status --porcelain` identical to its state after the first.
R8. [P1] `npm run icons:check` exits 0 on a clean tree. After one byte is appended to
    `components/icons/generated/icon-data.ts`, it exits non-zero and its output names that file; the same
    holds for `public/third-party-icon-licenses.txt`.
R9. [P1] `.github/workflows/quality.yml` runs `npm run icons:check` in the same job that runs
    `npm run typecheck`.
R10. [P1] `scripts/build-icons.ts` exits non-zero and prints the semantic name and the id when given a
    registry (through its `--registry <path>` option) that has: an id that does not exist in its set after
    alias resolution; a duotone entry whose body lacks the `opacity=".2"` layer; or a body containing any
    of `<script`, `<foreignObject`, `javascript:` or an attribute matching `\son[a-z]+=`.
    `tests/icon-generator.test.ts` runs the real script as a child process for each case and asserts the
    exit code and stderr. The unsafe-markup cases need a poisoned icon set, which the real sets cannot supply,
    so the script also accepts `--sets-dir <dir>` (icon sets read from `<dir>/<set>/icons.json` and
    `info.json` instead of `node_modules`); the same fixture with a safe body must exit 0.
R11. [P1] A registry entry for the Lucide id `check-circle-2` (stored in Iconify's data as an alias of
    `circle-check` in the pinned release) builds successfully and its generated body equals the body of the
    alias's parent icon.
R12. [P1] The set of semantic names in `components/icons/generated/icon-data.ts` equals the set of keys of
    `ICON_REGISTRY` (a unit test asserts equality in both directions).
R13. [P1] For every registry entry whose provider is `lucide`, the `<svg>` that `Icon` renders carries
    `fill="none"`, `stroke="currentColor"`, `stroke-linecap`, `stroke-linejoin` and `stroke-width` as
    attributes on the root, and no descendant element carries `fill="none"` or a `stroke-width` attribute
    except where the installed `lucide-react` renders the same attribute on the same element for that icon
    (a unit test over every such entry compares the two and lists each such case with a reason), so root
    classes such as `fill-current` and `fill-amber-400` still take effect.
R14. [P1] For every registry entry whose provider is `ph`, the rendered root carries `fill="currentColor"`;
    for a duotone entry no `opacity=".2"` remains and the secondary layer carries
    `style="fill:var(--icon-secondary,currentColor);opacity:var(--icon-secondary-opacity,.2)"`.

## Registry and component

R15. [P1] `components/icons/registry.ts` exports `ICON_REGISTRY` whose entries each have `tier` (one of
    `functional`, `status`, `decorative`), `provider` (one of `lucide`, `ph`) and `id`; every key matches
    `^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$` (so no trailing numeric suffix such as `-2`) and contains none of
    the substrings `lucide`, `phosphor`, `noto`, `duotone` (a unit test over all keys).
R16. [P1] Every `functional` entry has provider `lucide`: a unit test over all entries fails otherwise, and
    the registry's TypeScript type rejects a `functional` entry with provider `ph` (`npm run typecheck`
    fails on a fixture that tries it, `tests/icon-registry-types.test-d.ts` or an equivalent
    `@ts-expect-error` line that the compiler would flag as unused if the error disappeared).
R17. [P1] `renderToStaticMarkup` of `Icon` with `name="search"` yields one `<svg>` having
    `data-icon="search"`, `xmlns="http://www.w3.org/2000/svg"`, `focusable="false"`, a `viewBox`
    attribute, and `width="24" height="24"`.
R18. [P1] `size` values `xs`, `sm`, `md`, `lg`, `xl`, `2xl` render `width` and `height` attributes of
    12, 16, 20, 24, 32, 48 respectively.
R19. [P1] With no `label`, the `<svg>` has `aria-hidden="true"` and no `role` attribute; with
    `label="Search"` it has `role="img"` and `aria-label="Search"` and no `aria-hidden` attribute.
R20. [P1] `className` is appended to the `<svg>` class attribute, `style` is merged with any tone
    variables, and `strokeWidth={1.25}` renders `stroke-width="1.25"` on the root of a Lucide entry.
R21. [P1] A name that is not a registry key is a TypeScript error (`IconName` union), and when forced at
    runtime `Icon` renders the neutral `tag` glyph with `data-icon-fallback="true"` and does not throw.
R22. [P1] `components/icons/Icon.tsx` contains no `"use client"` directive and imports no React hook;
    it renders under `renderToStaticMarkup`, and an existing client component (`DepartmentScroller`)
    renders it in its own test.
R23. [P1] `tone` renders the class and secondary variables of the tone table in `plan.md`: for
    `tone="action"` the root has class `text-action` and style containing
    `--icon-secondary:var(--color-accent)` and `--icon-secondary-opacity:.7`; for `tone="current"` there
    is no tone class and no `--icon-secondary` in the style attribute. A unit test covers all six tones.
R24. [P1] Neither `components/icons/Icon.tsx` nor `components/icons/generated/icon-data.ts` contains a
    colour literal matching `#[0-9a-fA-F]{3,8}\b`.
R25. [P1] No file under `components/icons/` contains a Tailwind alpha modifier on a themed token, matching
    `(text|bg|fill|stroke|border)-(primary|action|accent|danger)(-[a-z]+)?/[0-9]+`.

## Licences

R26. [P1] A unit test, `tests/icon-lucide-parity.test.ts`, compares for every registry entry with provider
    `lucide` the geometry of the generated body with that of the installed `lucide-react` export of the same
    icon, and passes only if every divergence is listed in an exported `LUCIDE_PARITY_EXCEPTIONS` array with
    a reason, and every listed exception still diverges. Geometry is compared after normalisation
    (`scripts/lib/svg-geometry.ts`): path data is re-expressed with absolute coordinates, the subpaths of all
    `path`, `line`, `polyline` and `polygon` elements are compared as a sorted multiset, a closed subpath has
    one canonical spelling, and every number must agree within 0.06 user units on the 24 unit grid; `circle`,
    `rect` and `ellipse` attributes are compared in document order. A literal string comparison of the `d`,
    `cx`, `cy`, `r`, `x`, `y`, `x1`, `y1`, `x2`, `y2`, `width`, `height`, `rx`, `ry` and `points` attributes
    is not used: Iconify stores optimised, merged and rounded path data, so it would flag nearly every icon.
R27. [P1] `public/third-party-icon-licenses.txt` has one section per set referenced by the registry or the
    illustration map, each giving the set name, SPDX identifier, author, source URL and the upstream
    `LICENSE` text reproduced verbatim from the URL in that set's `info.json` (all copyright lines
    included); `npm run icons:build` exits non-zero if a used set's SPDX identifier has no licence text
    file under `scripts/icon-licences/`.
R28. [P1] On both vendors, a `GET /third-party-icon-licenses.txt` returns HTTP 200 with a `content-type`
    beginning `text/plain`, and the body names `Lucide`, and `Phosphor` from P3 and `Noto Emoji` from P4a, as
    each set first enters the registry or the illustration map.

## Migration (behaviour-preserving)

R29. [P1] `components/product/category-icon.ts` exports `categoryIconName(slug)` returning a semantic name
    (never a component), and returns the neutral `tag` name for an unmapped slug;
    `tests/category-icon.test.ts` asserts both; no file under `tests/` contains the string `svg.lucide-`.
R30. [P1] `components/staff/nav-items.ts` types each item's `icon` as a semantic name and imports nothing
    from `lucide-react`; `tests/staff-nav-parity.test.ts` and the existing `PanelNav` tests pass unchanged
    in meaning.
R31. [P1] `tests/fixtures/lucide-icons-in-use.json` lists the Lucide icons imported anywhere under `app`,
    `components`, `features` or `lib` at BASE (102 names; the first audit's figure of 141 also counted the `docs/ui-ref` mockups; the file states how it was
    produced), and a unit test asserts every name in it resolves to a registry entry (directly or
    through the documented mapping in that test).
R32. [P2b] `tests/icon-imports.test.ts` (TypeScript AST, no allowlist) asserts that no file under `app`,
    `features`, `lib`, or `components` other than `components/icons/` imports `lucide-react` or any module
    whose name starts with `@iconify`; the test also proves it can fail by running its checker against an
    in-memory file that violates the rule.
R33. [P1] `scripts/verify-icon-markup.ts` accepts `--base <url>`, repeatable `--path <path>` and optional
    `--sign-in <email>:<password>`, fetches each page's HTML, and prints to stdout one line of JSON per path:
    an array whose elements, one per `<svg>`, are `{ geometry, width, height, className, ariaHidden }` where
    `geometry` is the normalised geometry list of R26 joined by `;` (not a hash: a hash would call two
    Lucide releases' differently rounded copies of one icon different) and `className` is the class list with
    every token starting `lucide` removed and the rest sorted; all progress text goes to stderr; it exits 0
    when every page returned 200 and 1 for any other status, a redirect included. `--compare <before>
    <after>` reads two such outputs and exits 0 exactly when each page's two arrays pair up one to one on
    `(width, height, className, ariaHidden)` with geometry equal within the tolerance of R26.
R34. [P2a] The migration carries each icon's existing `className` over verbatim and sets no `size` prop, and
    for each of the storefront paths in `validation.md` on both vendors the output of R33 run against a
    server built at BASE and against a server built at the PR head are identical, meaning `--compare` of the
    two outputs exits 0.
R35. [P2b] The same holds for the signed-in and staff paths in `validation.md`, again on both vendors,
    with `--compare` exiting 0 for the whole slice's P1 to P2b head.
R36. [P2b] `grep -rn "LucideIcon" app components features lib` prints nothing, and no component takes an
    icon as a component-valued prop (`AccountNav`'s `NavLink`, `ViewSwitcher`, `PanelNav` and the staff hub
    pass semantic names).
R37. [all] Bundle budgets, measured with the commands in `validation.md` and compared with the figures
    recorded in `build-notes.md` at the start of Build: after P2b the sum of individually gzipped files
    under `.next/static/**/*.js` grows by at most 15 KB (15,360 bytes) and the `gzip:` figure that
    `npx wrangler deploy --dry-run --outdir <dir>` prints for the Worker upload (the deployable size; it
    is not the size of `.open-next/worker.js`, which is a 2 KB entry shim) by at most 100 KiB; after P3 by
    at most 25 KB and 100 KiB; after P4a by at most 30 KB and 100 KiB.

## Colour (P3)

R38. [P3] The icons of the table "Phase 3 surfaces" in `plan.md` are rendered through `Icon` with a
    `decorative` registry name whose provider is `ph` and with the tone shown in that table; the files
    named there import no other icon library; and no registry key that existed at the end of P2b changes
    its provider or tier (a decorative variant of an icon that is also used functionally elsewhere gets a
    new semantic name instead).
R39. [P3] In the served HTML of `/` on both vendors, every `<svg>` whose `data-icon` is a decorative name
    contains `--icon-secondary` and contains no colour literal matching `#[0-9a-fA-F]{3,8}\b`.
R40. [P3] The `<html>` or root element's inline `style` on `/` carries a different `--color-accent` value
    on the Aheed host than on the SriMart host, and `git diff BASE..HEAD --stat -- lib/vendor-theme.ts
    design-system/tokens/tokens.css` prints nothing (no token and no `brandStyle()` change).
R41. [P3] `tests/icon-tone-contrast.test.ts` asserts, for three brand primitive sets (the default, Forest
    Green `#1b4332 #40916c #e07a1f #c1121f #f4f6f0 #e6f4ea #fdebd3 #fbe4e4` and Berry Bold
    `#4a148c #7b1fa2 #ff6f00 #b71c1c #f6f0f5 #f1e3f4 #ffe4c4 #fadada`, in the order of
    `BrandPrimitives`' keys), that each of `--color-primary`, `--color-action`, `--color-accent` and
    `--color-danger` returned by `brandStyle()` has contrast of at least 4.5 to 1 against white and the
    vendor's cream, and against its own matching tint (`primary` against all three tints), using
    `contrastRatio` from `lib/color-contrast.ts`.

## Illustrations (P4a)

R42. [P4a] `components/icons/illustrations.ts` maps exactly these 16 slugs to Noto Emoji ids and no
    others: `fruit-veg` red-apple, `bakery` croissant, `dairy-eggs` glass-of-milk, `halal-meat`
    cut-of-meat, `groceries` shopping-cart, `international` globe-showing-europe-africa, `beverages`
    hot-beverage, `snacks` cookie, `household` soap, `frozen-foods` ice-cream, `health-beauty` lipstick,
    `baby-kids` teddy-bear, `pet-supplies` dog-face, `fish` fish, `sri-electronics` headphone, `sri-home`
    light-bulb; `departmentIllustration(slug)` returns `/illustrations/departments/<slug>.svg` for them
    and `null` for any other slug.
R43. [P4a] After `npm run icons:build`, `public/illustrations/departments/` holds exactly 16 files named
    `<slug>.svg`; each begins with `<svg`, contains a `viewBox`, passes the unsafe-content rule of R10, and
    is at most 16,384 bytes; their total is at most 98,304 bytes.
R44. [P4a] `DepartmentScroller` renders, for a mapped slug, an `<img>` whose `src` is
    `/illustrations/departments/<slug>.svg` with `alt=""` and no inline `<svg>` for that tile, and for an
    unmapped slug renders a decorative `Icon` (`data-icon="tag"`) and no `<img>` (unit test with one
    mapped and one unmapped slug).
R45. [P4a] Each `DepartmentScroller` tile keeps the classes `h-16 w-16`, its illustration has `h-12 w-12`,
    and the tile background class alternates `bg-action-tint` then `bg-accent-tint` by zero-based index
    parity.
R46. [P4a] `DepartmentHero`'s corner glyph is rendered by one exported component,
    `components/layout/DepartmentGlyph.tsx`, used in both places that render it (the branch with no image
    key and the image-failure fallback), and that component renders the illustration `<img>` with
    `h-24 w-24 md:h-32 md:w-32` for a mapped slug and the decorative `tag` `Icon` with `strokeWidth` 1.25
    for an unmapped one.
R47. [P4a] Illustration `<img>` elements carry explicit `width` and `height` attributes and
    `decoding="async"`; the first six in a strip have `loading="eager"` and the rest `loading="lazy"`.
R48. [P4a] `npm run icons:check` exits non-zero and names the file when one byte is appended to any file
    under `public/illustrations/departments/`.
R49. [P4a] `npx vitest run tests/vendor-neutral-copy.test.ts` passes, and no `.ts` or `.tsx` file under
    `components/icons/` contains a vendor name or a product-category word other than the 16 slugs and
    Noto ids of R42, which appear only in `illustrations.ts`.
R50. [all] `git diff BASE..HEAD --stat -- next.config.mjs` prints nothing, and the served HTML of `/` and
    `/categories` on both vendors contains no URL host other than the page's own origin and the vendor
    CDN, and no occurrence of the string `iconify`.
R51. [P4a] The served HTML of `/categories` on the SriMart host contains `<img` elements referencing only
    `sri-electronics.svg` and `sri-home.svg` under `/illustrations/departments/` (and only for those
    departments that exist), and the Aheed host's contains none whose file name starts `sri-`.

## Gates

R52. [all] `CHANGELOG.md` is updated under `[Unreleased]` and references `#1223` (Gate 4).
R53. [all] `lucide-react` remains in `package.json` `dependencies` at the end of this slice (Phase 5 is
    out of scope, and R26 needs the package).
R54. [all] `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`,
    `npm run icons:check`, `npm run kms:validate`, `npm run kms:check-generated` and `npm run build` all
    exit 0; the only tolerated test failure is the known flake `tests/add-to-cart-feedback.test.tsx:93`
    (`#983`), which must pass when that file is rerun alone.
R55. [all] After the last edit to `docs/` or `specs/`, `npm run kms:build-index` has been run and
    `npm run kms:check-generated` exits 0 (so `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts`
    are current; the index footer's timestamp is normalised by that check) and
    `npm run kms:assemble:internal` followed by `(cd kms/site-internal && npx next build --webpack)` exits 0.
