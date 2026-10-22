---
id: adr-008-icon-system
title: "ADR-008 — Icon system: semantic registry, build-time Iconify data, three tiers"
audience: [dev, architect, design]
type: adr
status: approved
version: "1.0.0"
updated: 2026-10-22
visibility: internal
summary: Icons are addressed by semantic name through a registry and rendered by one component from Iconify data bundled at build time. Lucide serves functional icons, Phosphor duotone decorative ones, Noto Emoji department illustrations as static files. Owner approved on 1223.
tags: [adr, icons, design-system, theming, multi-tenancy, csp]
related: [adr-004-multi-tenancy, adr-003-storage, design-system, tech-stack, icon-system-plan]
---

# ADR-008 — Icon system: semantic registry, build-time Iconify data, three tiers

Owner approval: 2026-10-22, issue `#1223` ("go ahead with recommendation"). Slice spec:
`specs/2026-10-22-icon-system/`. This record keeps the decision; the slice folder is the one-time work.

## Context

The storefront imports `lucide-react` in 107 files (141 distinct icons) and passes icon components
around as values. The owner wants colourful icons in the style of a modern delivery app, themed for each
vendor (Aheed, SriMart), with the icon library swappable without rewriting components. Three facts in the
repository constrain the design:

- **The CSP forbids a runtime icon API.** `connect-src` allows only `'self'` and the R2 endpoint, and
  `img-src` only `'self'`, `data:` and `https://*.nocaped.com`. Iconify's public API is neither.
- **Per-vendor colour arrives through `brandStyle()`'s inline custom properties**, which outrank
  `tokens.css`. New tokens must be listed there or they never reach a browser (#251).
- **Callers depend on Lucide's SVG shape**: stroke and fill attributes sit on the root `<svg>`, so a root
  Tailwind class such as `fill-current` works. Iconify's Lucide data puts them on each child.

## Decision 1 — Bundle icon data at build time; make no runtime request

A script (`npm run icons:build`) reads installed `@iconify-json/*` packages and writes only the icons the
registry names into a committed TypeScript file. Nothing is fetched at runtime and the CSP is unchanged.
`@iconify/react`, `@iconify/tailwind4` and `unplugin-icons` are not used: the first is a client runtime
that would need the API or a global registry, the second and third produce single-colour mask icons or add
a webpack loader to a pinned `--webpack` build.

## Decision 2 — Address icons by semantic name through a registry

`components/icons/registry.ts` maps a **semantic name** (a generic noun such as `search` or `delivery`, no
provider id and no numeric suffix) to `{ tier, provider, id }`. One component, `components/icons/Icon.tsx`,
renders any name. Components never import an icon library, and icon values are never passed as components;
navigation models carry names (strings). Replacing a library is a registry edit plus `icons:build`.
`tests/icon-imports.test.ts` forbids imports of `lucide-react` and `@iconify*` outside `components/icons/`.

## Decision 3 — Three inline tiers and one static mechanism

| Tier | Use | Source | Colour |
| --- | --- | --- | --- |
| `functional` | controls and navigation (chevrons, close, plus, search) | Lucide only, enforced by type and test | `currentColor` |
| `status` | alerts, success, info; never colour-only | Lucide or Phosphor | semantic tone |
| `decorative` | trust strip, rewards, empty states; meaning is in adjacent text | Phosphor duotone, two hue | tone plus a second vendor token |
| illustration (static files) | department tiles | Noto Emoji | fixed art on a vendor-tinted tile |

Illustrations are 2 to 12 KB each, so they are exported as static SVG files and rendered with `<img>`, not
inlined into HTML or client bundles (`DepartmentScroller` and `DepartmentHero` are client components).

## Decision 4 — Vendor theming reuses existing tokens; no new token

`Icon` reads `--color-primary`, `--color-action`, `--color-accent`, `--color-danger`, which `brandStyle()`
already emits per vendor and contrast-clamps. Phosphor duotone icons have one `opacity=".2"` layer; the
generator rewrites it to read `--icon-secondary` (default `currentColor`, opacity default `.2`), and `Icon`
sets that variable to a second vendor token when a `tone` is given. No token is added and `brandStyle()` is
unchanged, so the #251 failure cannot recur. Red is not used on new decorative surfaces.

## Decision 5 — Sets, licences and exact pins

| Package | Licence | Role |
| --- | --- | --- |
| `@iconify-json/lucide` | ISC | functional tier and fallback |
| `@iconify-json/ph` (Phosphor) | MIT | decorative tier |
| `@iconify-json/noto` (Noto Emoji) | Apache-2.0 | department illustrations |
| `@iconify/utils` | MIT | generator helpers |

All four are `devDependencies`, exact-pinned (the committed generated output depends on them), with the
literals in `tests/dependency-pins.test.ts`. Sets licensed Creative Commons Attribution (Streamline, Solar,
Twemoji) are excluded unless the owner approves a visible credit. The licence texts ship in
`public/third-party-icon-licenses.txt`, generated from the upstream `LICENSE` files. Lucide stays a
`dependency` until Phase 5 so a parity test can compare geometry (`tests/icon-lucide-parity.test.ts`).

## Consequences

- One change reaches every icon; a stale generated file fails CI (`icons:check` in `quality.yml`).
- Generated bodies are injected unescaped, so the generator rejects `<script`, `<foreignObject`,
  `javascript:` and event-handler attributes, and only committed build-time data is ever injected.
- The slug-to-illustration map stays in code, as `category-icon.ts` does today; a data-driven image key per
  category is `#1224` and needs a schema change.
- Coverage figures that justified the set choice were name matches, not visual reviews.

## Alternatives rejected

- **Iconify API at runtime:** blocked by the CSP, a third-party runtime dependency, a visitor-IP
  disclosure, icon pop-in.
- **One colourful set for everything:** loses the simple functional tier; no single set covers the 141
  icons in use.
- **Colour by CSS only on Lucide:** viable but outline-only, so no two-hue look.
- **AI-generated icons:** inconsistent, raster and unthemeable for glyphs; considered for illustrations
  only, as `#1224`.
