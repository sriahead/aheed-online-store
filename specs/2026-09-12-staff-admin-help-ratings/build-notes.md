# /build-notes for #737

**Phase:** IMPLEMENTATION completed

All four slices of the specification have been implemented, passing all existing and new validations:

1. **Staff/Admin delegation**
   - Lowered RBAC from `ADMIN` to `STAFF` for `categories`, `brands`, `promotions`, `bundles`, `products`, and `search-synonyms` pages and server actions.
   - Preserved `ADMIN` access for `payments` and AI synonym generation (`proposeSynonymsFromLog`).
   - Hid the AI Propose Synonyms form from STAFF.
   - Updated the Operator Runbook docs (`staff-tabs-guide.md` and `admin-tabs-guide.md`), moving sections and updating the "Who can access" lines to keep `operator-doc-coverage.test.ts` fully green.
   - Created `tests/admin-only-authorization.test.ts` to statically assert that STAFF are rejected with a 403 when trying to access ADMIN-only Server Actions.

2. **Category Manager improvements**
   - Reused `CategoryListClient.tsx` to add `Expand all` and `Collapse all` buttons interacting with the local `collapsedIds` state.
   - Moved the `CategoryForm` block above the list in `app/(admin)/staff/categories/page.tsx`.

3. **Help Centre presentation**
   - Extracted the custom Markdown heading-splitting logic from `RunbookClient.tsx` into a reusable `components/ui/DocumentSectionRenderer.tsx`.
   - Updated both `RunbookClient.tsx` and the shopper Help Centre (`app/(storefront)/help/page.tsx`) to use the shared renderer. 

4. **Hide zero-review ratings**
   - Created `components/product/ProductRating.tsx` which returns `null` if `reviewCount === 0`.
   - Replaced inline rating logic in `components/product/ProductCard.tsx` with the new component.
   - Added automated tests in `tests/product-rating.test.tsx` using `jsdom` to ensure ratings render or hide correctly.

**Notes on Scope & Limitations:**
- `staff-nav-parity.test.ts` was updated strictly to invert the expectation for `/staff/payments`, which is now an ADMIN route.
- Ran `kms:build-index` successfully. `docs.ts` and `ARTIFACT_INDEX.md` are aligned with the new documentation structure.
- Stopped at pre-clear gate as instructed.
