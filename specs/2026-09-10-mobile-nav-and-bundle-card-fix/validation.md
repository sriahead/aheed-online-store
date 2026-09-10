# Mobile nav visibility and Value Bundles card size (validation)

Small, source-verifiable slice — no schema, no new data path, no new route. Verification is grep
against source plus the standard local suite; no live-DB row is needed.

| Req | How to verify |
|-----|----------------|
| R1 | `grep -n 'href="/categories"' -A2 components/layout/Header.tsx` shows the link's `className` contains no `hidden` token. |
| R2 | `grep -n 'href="/shop-your-list"' -A2 components/layout/Header.tsx` shows the link's `className` contains no `hidden` token. |
| R3 | `grep -c 'hidden sm:inline' components/layout/Header.tsx` prints at least `2` (Shop, Shop List — pre-existing Sign In/Account usages of the same class also count, so check the two new spans by line number rather than the bare count alone). Each icon (`<Store`, `<ShoppingBag`) line carries no `hidden` class. |
| R4 | `grep -n 'variant === "badge"' -A6 components/layout/PostcodeChecker.tsx` shows the returned `<span>`'s className contains no `hidden` token. |
| R5 | `diff <(grep -o 'itemWidthClassName="[^"]*"' components/bundle/BundleRow.tsx) <(grep -o 'itemWidthClassName="[^"]*"' components/product/ProductRow.tsx)` prints no output (identical strings). |
| R6 | `git diff --stat origin/staging...HEAD` lists only `components/bundle/BundleRow.tsx`, `components/layout/Header.tsx`, `components/layout/PostcodeChecker.tsx`, `CHANGELOG.md`, and this `specs/2026-09-10-mobile-nav-and-bundle-card-fix/` directory. |
| R7 | `npm run lint`, `npx tsc --noEmit`, `npm run format:check`, `npx vitest run` (check the reported file/test totals against the current baseline — 118 files / 1589 tests — rather than trusting exit code alone) all exit 0. |
| R8 | `git diff --name-only origin/staging...HEAD \| grep -qx 'CHANGELOG.md'` exits 0, and the new entries name `#718` and `#719`. |

**Known-shaky / not verified:** neither R1-R5's *visual* effect (does the row actually fit and look
right at a real 320-414px phone width; do the bundle cards look proportionate) was checked in a
browser — no browser tool was available in the session that built this. `npm run build` was run and
passed, and the specific utility classes involved (`hidden`, `sm:inline`, `flex`, `inline-flex`,
`px-2`, `gap-1.5`) were confirmed present in the generated CSS output, which rules out the
documented "Tailwind never generated this variant" failure mode — but generation is not the same
proof as rendering correctly at a given width. Ask the owner to re-check the four reported pages on
staging after this ships, and treat this as open until they confirm.
