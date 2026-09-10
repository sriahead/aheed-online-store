# Search category select removal (build notes)

Written at the end of Build, before the Clear. Closes `#704`.

## What changed and why

**`components/product/ProductFilterForm.tsx`** loses the `Category` `<select>` block and the
`categories`/`categoryGroups` plumbing that only fed it (`toCategoryOptionGroups`,
`StorefrontCategoryNode` import, the `categories` prop) — the store owner found it redundant with
the department strip already at the top of every browse page.

**A hidden `category` passthrough field was added back**, not part of the original one-line
request but required by it: a plain `<form method="GET">` submits only the fields it contains,
replacing the whole query string. `#681`'s own comment on the now-removed select said the hidden
field's reasoning had "expired" because the select owned the field — with the select gone, that
reasoning reverses, and the case is exactly `#501`'s (`featured`) and `#568`'s (`category`,
originally) precedent: `category`'s only remaining entry point is a link (a recovery/suggestion
notice), so without a hidden field, applying any other filter from a category-scoped listing would
silently drop the category and widen the shopper back to the whole catalogue. Mirrors `featured`'s
existing hidden field exactly, including the same truthy-check-and-render pattern.

**`app/(storefront)/search/page.tsx`** reverts its category fetch from `categoryRepo.listTree()`
back to `categoryRepo.listTopLevel()`. `#681` widened this specifically to feed the select
(`categoryTree`, needed departments AND children); every other consumer on the page
(`DepartmentScroller`, `SearchRecoveryNotice`, `SearchSuggestionsNotice`) only ever used the
top-level rows (`categoryTree.filter(c => c.parentId === null)`) — exactly what `listTopLevel()`
already returns directly, with no `.filter()` needed. This restores the page to one category query
returning the smaller top-level-only shape, matching what it was before `#681` and what
`/categories/page.tsx` already uses — not a regression in query *count* (still one call), but a
reversion of the *shape* now that nothing needs the tree any more.

## Decisions taken during the build

**Kept the hidden field rather than leaving `category` unrepresented in the form.** The literal
request was "remove the component" — read narrowly, that's just the visible `<select>`. But this
codebase has hit the shape of bug a missing hidden field causes twice before (`#501`, `#568`), and
`plan.md` scoped the slice explicitly to preserve "the underlying `category` query-string
filtering... fully intact." Removing the select without restoring the hidden field would have
silently broken that promise the moment a shopper applied a second filter from a category-scoped
listing — worth the four extra lines to avoid reintroducing a bug this repo has already paid to
learn about.

**Added unit tests for the `category` passthrough**, mirroring `tests/product-filter-form.test.tsx`'s
existing `featured`-passthrough tests exactly (same file, new `describe` block) — the existing file
already exists for precisely this shape of regression, so extending it was the natural place rather
than a new file.

## Deviations from the spec

None. The build matches `plan.md`/`requirements.md` as written, including the mid-spec addition of
R3/R4 (the hidden-field requirement) — added to the spec files *before* writing any code, once the
GET-form-replaces-the-whole-query-string implication became clear, rather than discovered after and
patched in.

## Known-shaky areas

**Not visually screenshotted through a browser** — every claim below comes from raw rendered HTML
(`curl` + grep) and a real Prisma cross-check under `npm run preview`, not a Chrome screenshot, for
the same reason as the `#701` slice immediately before this one: no browser-automation tool was
available in this session. The HTML-level checks are exact (element presence/absence, attribute
values) rather than approximate, which bounds the risk, but a visual confirmation against the store
owner's own screenshot is still worth doing if a browser tool is available at `/validate`.

**R4 (the "survives Apply" case) is checked by directly constructing the GET request the form would
produce** (both `category` and `minPrice` set), not by driving an actual browser form submission —
there is no JavaScript involved either way (a plain `method="GET"` form), so the two are
equivalent, but it is a constructed request rather than an observed UI interaction.
