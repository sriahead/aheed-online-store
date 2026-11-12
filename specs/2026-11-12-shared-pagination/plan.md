---
id: 2026-11-12-shared-pagination-plan
title: "One reusable pagination component; staff product search below the filters (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-12
visibility: internal
summary: "Extracts the /staff/products pagination bar into components/ui/Pagination.tsx (numbered and sequential modes) and uses it on every paginated page; moves the staff product search row below Apply filters."
tags: [design-system, pagination, staff-panel, storefront]
related: [2026-11-11-stock-list-products-page-plan]
---

# One reusable pagination component (plan)

Issue #1538. Owner request, 2026-11-12: move the Staff Products search field below **Apply filters**.
Also make that page's pagination bar the standard, as one reusable component used wherever a list
pages.

## Owner decision

`specs/architecture.md` ("Pagination") allows numbered pages only on bounded lists. The owner chose
"one look, numbers where allowed" over numbered pages everywhere, which would have needed a new
architecture exception and a count query per category page.

| Page | Before | After |
| --- | --- | --- |
| Staff Products | numbered (own component) | `numbered` |
| Staff Customers | Previous/Next, 0-based `?page=` | `numbered`, 1-based `?page=`, total |
| Search, typed query | Next page | `numbered` (ranked set ≤ 200, offset cursor) |
| Search, browsing | Next page | `sequential`: Next, First page |
| Category browsing | Previous page / Next page | `sequential`: Page N, Previous, Next |
| Staff Orders | Older orders | `sequential`: Next, First page |
| Account Orders | Older orders | `sequential`: Next, First page |

## Change

- **`lib/pagination.ts`** (pure): `pageWindow` (moved from `lib/staff-products-query.ts`, which
  re-exports it), `pageCountFor`, `rowRange` and `parsePageParam`.
- **`components/ui/Pagination.tsx`**: a server component with a discriminated `mode`. It carries
  `data-pagination`, `data-tap-surface="pagination"` and `min-h-tap` chips. The noun comes from the
  caller.
- **Staff Products:** the search row moves to the end of the filter form. `staffProductsFilterFields`
  feeds the jump box and is derived from `staffProductsHref`, so the two cannot disagree.
  `StaffProductsPagination` is deleted.
- **Staff Customers:** `listCustomersForAdmin` returns `total` from a second `groupBy` (bounded by
  one vendor's customers). A page past the end redirects to the last page.
- **Search:** `ProductPage.rankedTotal` is set by `searchProducts`'s ranked path only.
  `searchFirstPageHref` drops the cursor.
- **Category:** `categoryPageNumber` comes from the cursor stack's depth.
- **Docs:** `specs/design-system.md` gains a "Pagination" section (1.27.0).
