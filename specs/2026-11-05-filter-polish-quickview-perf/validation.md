# Product Filter Polish, Subcategory Icons, Quick View Performance & Filter Persistence (validation)

## Verification Matrix

| ID | Requirement | Test Command / Probe | Expected Result |
|---|---|---|---|
| V1 | Category navigation preserves filters | `npx vitest run tests/category-href.test.ts` | `categoryNavHref` preserves `minPrice`, `isHalal`, `sort`, `attr_*` and drops `cursor`/`back` |
| V2 | Subcategory pills render icons | `npx vitest run tests/subcategory-links.test.tsx` | Links render `<Icon />` with `aria-hidden="true"`, link accessible text is preserved |
| V3 | Subcategory icon mapping | `npx vitest run tests/category-icon.test.ts` | Subcategory slugs map to appropriate semantic icon names |
| V4 | Quick View instant hydration & cache | `npx vitest run tests/quick-view.test.tsx` | Image rendered immediately with provided `cdnBaseUrl`, repeated opens hit in-memory cache |
| V5 | Quick View API concurrency | `npx vitest run tests/quick-view-route.test.ts` | Returns product, reviews, user, and `Cache-Control` header |
| V6 | Filter form decluttering | `npx vitest run tests/product-filter-form.test.tsx` | Clean fieldsets, no redundant search on `/search`, no duplicative preset buttons |
| V7 | Full regression test suite | `npx vitest run --maxWorkers=4` | All unit and integration test suites pass |
| V8 | Static code quality | `npm run lint && npm run format:check && npm run typecheck && npm run icons:check` | Clean exit 0 |
| V9 | KMS documentation validation | `npm run kms:validate` | 0 failing articles |
