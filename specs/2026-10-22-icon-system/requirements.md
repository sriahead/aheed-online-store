# Colourful, vendor-themed, provider-agnostic icon system (requirements / acceptance criteria)

Closes the build scope of issue `#1223` (Phases 1 to 4a). Builds on `specs/decisions/ADR-008-icon-system.md`
(the decision), `specs/design-system.md` and `specs/decisions/ADR-004-multi-tenancy.md`. In one line: one
`Icon` component over a semantic-name registry and build-time bundled Iconify data, Lucide for
functional icons, Phosphor duotone for decorative ones, Noto Emoji department illustrations as static
files, all coloured from the tokens `brandStyle()` already emits. `plan.md` carries the reasoning.

Each requirement is tagged with the pull request that must satisfy it: **P1** foundation, **P2a**
storefront migration, **P2b** admin migration and import ban, **P3** colour, **P4a** illustrations,
**all** every PR. A later PR must keep every earlier requirement true.

**Second amendment of 2026-10-23 (the remaining phases are clubbed, owner decision on `#1223`).** The
slice now ships as two pull requests: **PR A is Phase 2b alone** (invisible) and **PR B is Phases 3 and 4a
together** (visible), cut from `staging` after PR A has merged. A requirement tagged **P3** or **P4a** is
checked at the **PR B head**; one tagged **P2b** at the **PR A head**. Two consequences are written into the
requirements below and not left to the reader: (1) R34, R35 and R56 to R60 prove that a PR changed nothing
visible, so they are checked **at the PR A head** and are deliberately not required at the PR B head, where
R64 and R65 bound what PR B may change instead; (2) the P1 test of `DepartmentScroller`'s `svg[data-icon]`
output (R22's third clause) and its pre-migration class assertions are superseded at the PR B head by requirements 44 and 45 (below). New requirements: 63 (Noto Emoji's licence text), 64 and 65 (what PR B may change), 66 (`design-system.md`).
`plan.md`, "Phase 2b, 3 and 4a clubbing", has the reasons.

**Third amendment of 2026-10-24 (before PR B is built; owner decision on `#1223`).** The footer link to
`/third-party-icon-licenses.txt`, open since Phase 1 as "the owner's call", is wanted. New requirement R67 (tagged
P4a, checked at the PR B head); R64's file list gains `components/layout/StorefrontFooter.tsx`. Nothing else
changes except one found when Build read `tests/storefront-image-fallback.test.ts`: it permits a JSX `<img>` only inside
`components/ui/ImageWithFallback.tsx`, which has no `decoding` prop, so R47 cannot be met without it. R64's file list
therefore also gains `components/ui/ImageWithFallback.tsx` (one optional `decoding` prop, nothing else), and every
illustration `<img>` of R44, R46 and R47 is rendered through `ImageWithFallback`, with the decorative `tag` `Icon` as
its fallback, so a missing static file degrades to the neutral glyph and not to a broken-image icon (#655).
`plan.md`'s exclusion and open-item text is updated to match.

**Amendment of 2026-10-23 (before P2a is built).** R34, R35, R36 and R37 are rewritten and R56 to R62 are
added, from what P1's validation and merge measured (issue `#1223`, the approved proposal comment, and
`#1226`). Nothing tagged P1 changes. The reasons are in `plan.md`, "Phase 2 amendment". Definitions used
below:

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
    included), **except Noto Emoji, which R63 governs** (its `info.json` URL returns 404);
    `npm run icons:build` exits non-zero if a used set's SPDX identifier has no licence text file under
    `scripts/icon-licences/`.
R28. [P1] On both vendors, a `GET /third-party-icon-licenses.txt` returns HTTP 200 with a `content-type`
    beginning `text/plain`, and the body names `Lucide`, and `Phosphor` from P3 and `Noto Emoji` from P4a, as
    each set first enters the registry or the illustration map (at the PR B head, all three).

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
    at the P2a head, for each of the storefront and signed-in customer path lists in `validation.md`
    (`PATHS_A`, `PATHS_S`, `PATHS_CUST`) on the vendor each list names, the output of R33 run against a
    server built at BASE and against a server built at the PR head are identical, meaning `--compare` of the
    two outputs exits 0 and prints `identical: N page(s)` with N the list's page count. BASE remains the
    reference, so the comparison is cumulative and covers P1 again (P1's own head was compared once, on
    2026-10-23: `#1226`). The customer list is here, not in P2b, because P2a migrates the `/account` and
    `/quick-shop` files. R34 is checked at the P2a head and at the PR A head (P2b); it is **not** required at
    the PR B head, where markup changes on purpose (R64, R65).
R35. [P2a, P2b] The same holds for the staff path lists (`PATHS_STAFF_A`, `PATHS_STAFF_S`) at the P2a head
    **and again** at the P2b head, and at the P2b head every list of R34 is run again. P2a is included
    because it migrates components that staff pages also render (an import scan of `app/(admin)` and
    `components/staff` finds `components/errors/ErrorPanel`, a P2a file, and a transitive import can add
    more). The SriMart staff pair has a precondition: a
    sign-in as `demo-srimart-admin@example.com` with `DEMO_ACCOUNT_PASSWORD` from `.dev.vars` returns 200
    (`#1226` found a stale password hash in the dev database, so it returned 401). A pair whose sign-in
    does not return 200 is UNVERIFIED, which fails P2b and does not fail P2a. (The pair was verified once, on
    2026-10-23, at the P2a head: `#1227`.) R35 is checked at the PR A head and is **not** required at the PR B
    head; R65 is its PR B counterpart for the staff lists.
R36. [P2b] `grep -rn "LucideIcon" app components features lib --exclude=docs.ts` prints nothing, and no
    component takes an icon as a component-valued prop (`AccountNav`'s `NavLink`, `ViewSwitcher`,
    `CollectionNav`, `PanelNav` and the staff hub pass semantic names). The files in R57 are migrated in P2a;
    P2b only checks the result.
R37. [all] Bundle budgets, measured with the commands in `validation.md` against a BASE build made the same
    way, back to back (a stored baseline is not used: P1's was 11.7 KiB wrong on the Worker figure). At the P2a head
    and at the PR A head (P2b) the sum of individually gzipped files under `.next/static/**/*.js` grows by at most 15 KB
    (15,360 bytes) and the `gzip:` figure that `npx wrangler deploy --dry-run --outdir <dir>` prints for the
    Worker upload (the deployable size; it is not the size of `.open-next/worker.js`, which is a 2 KB entry
    shim) by at most 100 KiB (measured at P1: +794 bytes and +4.42 KiB; at P2a: -25,350 bytes and -19.8 KiB). At
    the PR B head (P3 and P4a together) the same two figures against BASE grow by at most 30 KB (30,720 bytes)
    and 100 KiB.

## Phase 2 amendment (P2a and P2b)

R56 to R60 are proofs that the migration changed nothing: they are checked at the P2a head and, for their
P2b clauses, at the PR A head, and are **not** required at the PR B head (R64 and R65 replace them there).

R56. [P2a] The P2a pull request touches no file under `app/(admin)/` or `components/staff/` except the
    generated `app/(admin)/staff/runbook/docs.ts` (which `npm run kms:build-index` rewrites whenever a doc
    changes, so it cannot be excluded from a slice that edits docs):
    `git diff --name-only <P1 merge c439d3b>..<P2a head> -- "app/(admin)" components/staff ":!app/(admin)/staff/runbook/docs.ts"`
    prints nothing.
    Every file that still imports `lucide-react` at the P2a head is under one of those two paths, and
    there are exactly the 39 that imported it at the P1 merge. After P2a, no file elsewhere under `app`,
    `components`, `features` or `lib` (other than `components/icons/`) imports `lucide-react`. P2b is
    "every remaining file", so P2b's diff is exactly those 39 plus the import ban and docs.
R57. [P2a] Five files cannot be migrated mechanically (each already has a local binding named `Icon`) and
    are migrated by hand, each to semantic names with every icon's `className` text unchanged and no
    `size` prop: `app/(storefront)/quick-shop/page.tsx`, `components/account/AccountNav.tsx`,
    `components/layout/ViewSwitcher.tsx`, `components/product/CollectionNav.tsx` and
    `components/cart/AddToCartButton.tsx`. After P2a none of them imports `lucide-react`, holds a component
    as a value (a prop, an object field, a ternary or a lookup table), or types anything as `LucideIcon`
    or `React.ComponentType<{ className`: the props that carried an icon (`NavLink`'s `icon`, the
    `views` array's `icon`, `COLLECTIONS`' `icon`) are typed `IconName`, and `AddToCartButton` chooses
    among the registry names `loader-circle`, `check` and `plus` (what `tests/fixtures/lucide-icons-in-use.json`
    assigns to `Loader2`, `Check` and `Plus`) and renders `<Icon name={...}>` at each site. Where an element's markup is unchanged
    by construction (the rendered `<svg>` attributes), R34 proves it.
R58. [P2a] `scripts/verify-classname-parity.ts` exists and takes `--base-root <dir>`, `--head-root <dir>`,
    repeatable `--allow <path>` and optional `--require-migrated`. For every `.ts` or `.tsx` file present
    under `app`, `components`, `features` or `lib` in both trees (except `components/icons/` and
    `--allow`ed paths) it parses both with the TypeScript compiler and takes, in document order, at BASE
    every JSX element whose tag is an identifier imported from `lucide-react` (resolved by its local name, so `import { Search as SearchIcon }` counts), and at HEAD every JSX
    element whose tag is `Icon` imported from `@/components/icons/Icon` or `@/components/icons`. The two
    lists must have equal length, and element by element the source text of the `className` initialiser
    must be equal (a missing `className` equals a missing `className`), and the HEAD element's props must be
    exactly the BASE element's props with `aria-hidden` removed and `name` added, each with source text equal
    to its BASE counterpart (`name` excepted); a HEAD element carrying `size`, `tone`, `label` or a spread
    attribute fails. A common file that still imports `lucide-react` at HEAD is "not migrated":
    it is not paired, it is reported on stderr, and it is accepted unless `--require-migrated` is given,
    which makes it a failure. It exits 0 exactly when nothing failed and
    prints one `file:line: <reason>` line on stderr per failure, plus a final line
    `checked N file(s), M not migrated, K allowed`.
R59. [P2a] `tests/verify-classname-parity.test.ts` spawns the real script (as a child process, the R10 rule)
    against fixture trees written to a temp directory, and asserts the exit code and stderr for: an
    identical pair (exit 0); a pair where one `className` text differs (non-zero, naming the file and line);
    a pair where HEAD adds `size="sm"` (non-zero); a pair where an element was dropped (non-zero); a pair
    whose HEAD file still imports `lucide-react` (exit 0 without `--require-migrated`, non-zero with it);
    and an `--allow`ed file that would otherwise fail (exit 0, counted as allowed). The allowlist the P2a
    pull request passes is the exported `CLASSNAME_PARITY_ALLOWLIST` in
    `tests/fixtures/classname-parity-allowlist.ts`, each entry with a reason, and a unit test asserts its
    set of paths equals exactly nine files: the five of R57 and the four files P1 migrated whose icon was
    already a component value at BASE (`app/(admin)/staff/page.tsx`, `components/layout/DepartmentHero.tsx`,
    `components/layout/DepartmentScroller.tsx`, `components/staff/PanelNav.tsx`; found when Build ran the
    real script, which cannot pair a BASE element whose tag was a local binding). Those four were proved
    live against BASE by `#1226`.
R60. [P2a] Run against a BASE checkout and the P2a head with that allowlist, the script exits 0 and prints
    `K allowed` with K equal to 9, and its "not migrated" count equals the 39 files of R56. [P2b] Run
    against BASE and the P2b head with `--require-migrated` and the same allowlist it exits 0 and its "not
    migrated" count is 0.
R61. [P2a] `docs/developer-portal/local-dev-playbook.md` states, each in its own sentence: that Node on
    Windows cannot resolve `srimart.localhost` (`getaddrinfo` fails with `ENOTFOUND`, while `curl.exe`
    resolves it), with the two remedies (a hosts-file entry for `srimart.localhost`, or a DNS preload
    passed through `NODE_OPTIONS`); and that `scripts/demo-accounts.ts add` does not reset the password of an
    account that already exists, so a demo account created before `DEMO_ACCOUNT_PASSWORD` changed returns
    401 on sign-in (`#1226`) and must be repaired by the owner. Its `updated` date and `version` are bumped.
R62. [P2b] `CLAUDE.md`'s bullet under `Design tokens & per-vendor branding` that begins "Icons are used only
    through `components/icons`" no longer contains the words "being migrated" or "do not add new ones",
    and says the import ban is enforced by `tests/icon-imports.test.ts`. No registry key present at the P1
    merge is removed, and none changes provider or tier (the registry is deliberately not pruned in this
    phase), and every key added by P2a or P2b obeys R15.

## Phase 3 and 4a clubbing (PR B)

R63. [P4a] Noto Emoji's licence text. `scripts/icon-licences/Apache-2.0.txt` is byte-identical to
    `https://www.apache.org/licenses/LICENSE-2.0.txt` (11,358 bytes when this was written), and
    `public/third-party-icon-licenses.txt` has a section that begins with the line `Noto Emoji` and gives
    SPDX `Apache-2.0`, author `Google Inc`, source `https://github.com/googlefonts/noto-emoji`, that text, and
    one sentence that says all of: the licence URL in the set's `info.json`
    (`https://github.com/googlefonts/noto-emoji/blob/main/svg/LICENSE`) returned HTTP 404 on 2026-10-23; the
    project README states "Tools and most image resources are under the Apache license, version 2.0"; and
    none of the 16 illustrations of R42 is a region flag (the exception the README names). The section is
    emitted by `npm run icons:build`, so `npm run icons:check` covers it (R8). The repository's root
    `LICENSE` is the SIL Open Font License for the fonts and is not used.
R64. [P3, P4a] PR B is cut from the PR A merge and changes only what it names:
    `git merge-base --is-ancestor <PR A merge> <PR B head>` exits 0, and every path printed by
    `git diff --name-only <staging tip>...<PR B head>` (three dots: PR B's own change against the `staging` tip it was last
    synced with; written 2026-10-24 because `#1233` merged to `staging` while PR B was open, and the original two-dot
    form against the PR A merge would have counted that unrelated slice's files) is one of: the six files of the "Phase 3 surfaces" table
    in `plan.md`; `components/layout/DepartmentScroller.tsx`, `components/layout/DepartmentHero.tsx`,
    `components/layout/DepartmentGlyph.tsx`, `components/product/category-icon.ts`,
    `components/layout/StorefrontFooter.tsx` (R67), `components/ui/ImageWithFallback.tsx` (R47); anything under
    `components/icons/`, `public/illustrations/departments/`, `scripts/`, `tests/`, `docs/` or `specs/`;
    `public/third-party-icon-licenses.txt`, `package.json`, `package-lock.json`, `CHANGELOG.md`,
    `ARTIFACT_INDEX.md`, `app/(admin)/staff/runbook/docs.ts`. Any other path is a failure; a path that
    legitimately needs changing is a spec change, not a judgement for the builder.
R65. [P3, P4a] At the PR B head, every staff path list is identical to the PR A head: for `PATHS_STAFF_A`
    and `PATHS_STAFF_S` on both vendors, `--compare` of the R33 output captured against a server built at
    the PR A merge and one built at the PR B head exits 0 and prints `identical: 5 page(s)` and
    `identical: 2 page(s)`. This is checkable because the admin layout renders no Phase 3 or 4a surface:
    `app/(admin)/layout.tsx` imports `Header` only, `StorefrontChrome` (which holds the Rewards launcher)
    wraps storefront and landing pages only, and the one admin page that renders `DepartmentHero`,
    `/staff/promotions`, is in neither staff list. The SriMart pair's sign-in precondition is R35's.
R66. [P4a] `specs/design-system.md`'s `## Icons` section (from that heading to the next `## ` heading) no
    longer contains the words `not yet shipped`, `Lucide today` or `from Phase 3`; its tier table says the
    `decorative` tier is Phosphor duotone; and it names `components/icons/illustrations.ts`,
    `public/illustrations/departments/`, the 16 slugs' mechanism (static files rendered with `<img>`, not
    inlined) and `public/third-party-icon-licenses.txt`. `specs/decisions/ADR-008-icon-system.md` is unchanged
    in status (`approved`) and still states each item of R1.

R67. [P4a] The storefront footer links to the licence file. `components/layout/StorefrontFooter.tsx` renders an
    `<a href="/third-party-icon-licenses.txt">` with the visible text `Icon credits`, on every vendor and whatever
    the profile holds (it is platform attribution, not vendor copy, so the "a null hides" rule of #239 does not apply),
    in the bottom-left block beside "Powered by" (not in the `Legal` nav, whose `lg:whitespace-nowrap` column cannot
    take a fifth item). It carries the footer's `LINK` classes (so the 44 pixel tap height below `md` holds,
    `tests/tap-targets.test.ts` stays green) and `target="_blank" rel="noopener noreferrer"`. `tests/storefront-footer.test.tsx`
    asserts the `href`, the text and both attributes for a vendor with no optional data. On both vendors `GET /` contains
    `href="/third-party-icon-licenses.txt"`, and that URL still returns 200 `text/plain` (R28).

## Colour (P3)

R38. [P3] The icons of the table "Phase 3 surfaces" in `plan.md` are rendered through `Icon` with a
    `decorative` registry name whose provider is `ph` and with the tone shown in that table; the files
    named there import no other icon library; and no registry key that existed at the PR A merge changes
    its provider or tier (a decorative variant of an icon that is also used functionally elsewhere gets a
    new semantic name instead).
R39. [P3] In the served HTML of `/` on both vendors, every `<svg>` whose `data-icon` is a decorative name
    **whose provider is `ph`** (the nine Phase 3 names) contains `--icon-secondary`, and no `<svg>` whose `data-icon`
    is a decorative name contains a colour literal matching `#[0-9a-fA-F]{3,8}\b`. (Corrected 2026-10-24 from the first
    wording, which said "every decorative name": a decorative `lucide` icon such as `sparkles` or `truck` is a single
    layer and has no secondary to carry, so the live run of `#1234` could only report it as a wording question.)
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
